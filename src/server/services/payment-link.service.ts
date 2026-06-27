import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";

/** Validade de um link de pagamento nao pago: 12 horas. */
export const PAYMENT_LINK_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Expira (ACTIVE -> EXPIRED) todos os links de pagamento vencidos (expiresAt no
 * passado) e ainda nao pagos. Cross-tenant (cron). Idempotente. Um pagamento ja
 * iniciado nao e barrado por aqui — so o link em si caduca para novos acessos.
 */
export async function expireStalePaymentLinks(): Promise<{ expired: number }> {
  const res = await withAdmin((tx) =>
    tx.paymentLink.updateMany({
      where: { status: "ACTIVE", expiresAt: { lt: new Date() } },
      data: { status: "EXPIRED" },
    }),
  );
  if (res.count > 0) {
    logger.info("payment-link: links expirados", { expired: res.count });
  }
  return { expired: res.count };
}
