import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";

/**
 * Propaga um deposito NAO-PAGO (expirado/falho) para a QuickSale (venda avulsa
 * DePix) associada. Compartilhado pelo handler de webhook da Eulen.
 *
 * Venda do PDV (sales) NAO e concluida por webhook (o operador finaliza
 * manualmente); so a QuickSale, que e 100% DePix, transiciona aqui.
 */
export async function propagateDepositNotPaid(
  pixpayDepixId: string,
  outcome: "EXPIRED" | "FAILED",
): Promise<number> {
  const res = await withAdmin((tx) =>
    tx.quickSale.updateMany({
      where: { depixTransactionId: pixpayDepixId, status: "AWAITING_PAYMENT" },
      data: {
        status: outcome === "EXPIRED" ? "EXPIRED" : "CANCELLED",
        depixStatus: outcome === "EXPIRED" ? "expired" : "failed",
      },
    }),
  );
  if (res.count > 0) {
    logger.info("Deposito nao-pago propagado p/ QuickSale", {
      pixpayDepixId,
      outcome,
      affected: res.count,
    });
  }
  return res.count;
}
