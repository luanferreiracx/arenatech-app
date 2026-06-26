import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { timingSafeEqualString } from "@/lib/utils/timing-safe";
import { retryRepayment } from "@/server/services/depix-transaction.service";

export const dynamic = "force-dynamic";

/** Lote por execucao — evita um cron longo demais; o proximo ciclo pega o resto. */
const BATCH_SIZE = 50;

/**
 * POST /api/cron/process-deposit-repayments
 *
 * Reprocessa repasses PENDING da carteira de taxas (ADR 0052): quando o
 * repasse do liquido ao tenant non-custodial falhou no settle (LWK fora, fee
 * L-BTC), o DepixDepositRepayment ficou PENDING. Este cron tenta de novo com a
 * MESMA idempotencyKey (repay:{id}) — sem duplicar on-chain. Ao concluir, libera
 * os efeitos de negocio (a venda so e liberada quando o liquido chega ao tenant).
 *
 * Sugerido a cada ~2-5 min. Sem auth de tenant — roda via withAdmin (cross-tenant).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    logger.error("[cron-deposit-repayments] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (!timingSafeEqualString(authHeader ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron-deposit-repayments] Unauthorized cron attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pending = await withAdmin(async (tx) =>
      tx.depixDepositRepayment.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: BATCH_SIZE,
        select: { id: true },
      }),
    );

    let completed = 0;
    let stillPending = 0;
    let failed = 0;
    let skipped = 0;
    for (const { id } of pending) {
      const res = await retryRepayment(id);
      if (res.status === "completed") completed += 1;
      else if (res.status === "pending") stillPending += 1;
      else if (res.status === "failed") failed += 1;
      else skipped += 1;
    }

    logger.info("[cron-deposit-repayments] processed", {
      scanned: pending.length,
      completed,
      stillPending,
      failed,
      skipped,
    });
    return NextResponse.json({
      success: true,
      scanned: pending.length,
      completed,
      stillPending,
      failed,
      skipped,
    });
  } catch (err) {
    logger.error("[cron-deposit-repayments] failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
