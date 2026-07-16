import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/server/db";
import { withCronLock } from "@/server/cron-lock";
import { logger } from "@/lib/logger";
import { timingSafeEqualString } from "@/lib/utils/timing-safe";
import { retryRepayment, retryWithdrawForwards } from "@/server/services/depix-transaction.service";

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
    let summary = { scanned: 0, completed: 0, stillPending: 0, failed: 0, skipped: 0, withdrawForwards: 0 };
    // Lock por job: idempotencyKey ja impede duplo repasse on-chain, mas o lock
    // evita duas instancias varrendo o mesmo lote (contadores/lastError em corrida).
    const ran = await withCronLock("process-deposit-repayments", async () => {
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
      // Repasses/refunds PENDING do SAQUE EXTERNO (Fase B) — mesma fila idempotente
      // (fwd:{id}); reprocessa junto neste ciclo.
      const fwd = await retryWithdrawForwards(BATCH_SIZE);
      summary = {
        scanned: pending.length,
        completed,
        stillPending,
        failed,
        skipped,
        withdrawForwards: fwd.processed,
      };
    });
    if (!ran) return NextResponse.json({ skipped: "locked" });

    logger.info("[cron-deposit-repayments] processed", summary);
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    logger.error("[cron-deposit-repayments] failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
