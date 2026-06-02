import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { timingSafeEqualString } from "@/lib/utils/timing-safe";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/mark-overdue
 *
 * Marca como OVERDUE todas as installments PENDING com dueDate < agora.
 * Recalcula o status de cada FinancialTransaction afetada.
 *
 * Cron diario sugerido: 03:00 BRT (00:00 UTC). Sem auth de tenant —
 * roda como admin (sem RLS) pra cobrir todos os tenants em uma chamada.
 *
 * Antes existia procedure tenant-scoped (financial.markOverdue), mas
 * precisava ser chamada por tenant — uso operacional impraticavel. Esta
 * rota global atende o cron real.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    logger.error("[cron-mark-overdue] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (!timingSafeEqualString(authHeader ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron-mark-overdue] Unauthorized cron attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Cron global cross-tenant: roda via withAdmin (role app_admin, BYPASSRLS)
    // para cobrir TODOS os tenants. Com o runtime logando como app_login
    // (nao-superuser, sujeito a RLS), `prisma` direto so enxergaria 0 linhas.
    const { result, txUpdated } = await withAdmin(async (tx) => {
      const result = await tx.installment.updateMany({
        where: {
          status: "PENDING",
          dueDate: { lt: now },
          transaction: { deletedAt: null },
        },
        data: { status: "OVERDUE" },
      });

      // Marca transactions com qualquer installment OVERDUE e status PENDING.
      const txUpdated = await tx.$executeRaw`
        UPDATE financial_transactions ft
        SET status = 'OVERDUE', updated_at = NOW()
        WHERE ft.status = 'PENDING'
          AND ft.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM installments i
            WHERE i.transaction_id = ft.id AND i.status = 'OVERDUE'
          )
      `;
      return { result, txUpdated };
    });

    logger.info("[cron-mark-overdue] processed", {
      installmentsMarked: result.count,
      transactionsMarked: Number(txUpdated),
    });

    return NextResponse.json({
      success: true,
      installmentsMarked: result.count,
      transactionsMarked: Number(txUpdated),
    });
  } catch (err) {
    logger.error("[cron-mark-overdue] failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
