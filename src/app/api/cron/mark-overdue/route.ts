import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

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
  if (authHeader !== `Bearer ${expectedSecret}`) {
    logger.warn("[cron-mark-overdue] Unauthorized cron attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Marca tudo de uma vez (sem tenant scope — cron global).
    const result = await prisma.installment.updateMany({
      where: {
        status: "PENDING",
        dueDate: { lt: now },
        transaction: { deletedAt: null },
      },
      data: { status: "OVERDUE" },
    });

    // Recalcula status das FinancialTransactions afetadas.
    // Como updateMany nao retorna ids, fazemos um SELECT antes de
    // dar o update e iteramos transacoes unicas via raw query.
    // Para evitar 2 passos, atualizamos status do parent diretamente
    // quando a unica installment dele virou OVERDUE.
    // Heuristica simples: marca transactions com qualquer installment
    // OVERDUE e status atual PENDING como OVERDUE.
    const txUpdated = await prisma.$executeRaw`
      UPDATE financial_transactions ft
      SET status = 'OVERDUE', updated_at = NOW()
      WHERE ft.status = 'PENDING'
        AND ft.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM installments i
          WHERE i.transaction_id = ft.id AND i.status = 'OVERDUE'
        )
    `;

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
