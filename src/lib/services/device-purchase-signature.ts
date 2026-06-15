import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";

/**
 * Libera o aparelho comprado quando o cliente assina o termo de responsabilidade
 * no Autentique. Usado pelo webhook do Autentique.
 *
 * O createPurchase cria o StockItem como BLOCKED e o termo segue para assinatura.
 * Sem isto, o webhook so tratava OS/orcamento — o aparelho assinado ficava
 * BLOCKED ate alguem clicar "verificar status" manualmente (gap operacional:
 * aparelho comprado e assinado ficava invendavel).
 *
 * Idempotente: se a compra ja foi marcada como assinada, nao faz nada.
 *
 * @returns `null` se o documentId nao corresponde a uma compra; `{ purchaseId }`
 *   quando o termo foi confirmado e o StockItem liberado.
 */
export async function approveDevicePurchaseTermBySignature(
  documentId: string,
  signedAt: Date,
): Promise<{ purchaseId: string } | null> {
  return withAdmin(async (tx) => {
    const purchase = await tx.devicePurchase.findFirst({
      where: { autentiqueDocumentId: documentId },
    });
    if (!purchase) return null; // nao e uma compra de aparelho

    if (purchase.termSigned) {
      logger.info("Compra ja assinada — webhook Autentique idempotente", {
        purchaseId: purchase.id,
      });
      return { purchaseId: purchase.id };
    }

    await tx.devicePurchase.update({
      where: { id: purchase.id },
      data: {
        termSigned: true,
        termSignedAt: signedAt,
        termSignedVia: "autentique",
      },
    });

    // Libera o StockItem BLOCKED criado por essa compra (BLOCKED -> AVAILABLE).
    // Match por (productId, imei OU serial) — mesma logica do createPurchase.
    if (purchase.productId && (purchase.imei || purchase.serial)) {
      await tx.stockItem.updateMany({
        where: {
          productId: purchase.productId,
          status: "BLOCKED",
          deletedAt: null,
          ...(purchase.imei
            ? { imei: purchase.imei }
            : { serialNumber: purchase.serial }),
        },
        data: { status: "AVAILABLE", notes: null },
      });
    }

    return { purchaseId: purchase.id };
  });
}
