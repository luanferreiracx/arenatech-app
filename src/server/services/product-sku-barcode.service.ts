import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";

/**
 * Garante que SKU e código de barras estão livres dentro do tenant, lançando um
 * CONFLICT amigável se algum já pertence a outro produto (não deletado). Fonte
 * única do dedup — usada no create, update e duplicate, para nenhum caminho de
 * escrita criar duplicata (o índice único parcial no banco é a rede de segurança
 * final; este check dá a mensagem clara antes).
 *
 * `excludeProductId` isenta o próprio produto na edição (não conflita consigo).
 * O escopo de tenant vem do `withTenant` (RLS) que envolve o `tx`.
 */
export async function assertSkuBarcodeAvailable(
  tx: Prisma.TransactionClient,
  params: {
    sku?: string | null;
    barcode?: string | null;
    excludeProductId?: string;
  },
): Promise<void> {
  const sku = params.sku?.trim();
  const barcode = params.barcode?.trim();
  const notSelf = params.excludeProductId
    ? { id: { not: params.excludeProductId } }
    : {};

  if (sku) {
    const dup = await tx.product.findFirst({
      where: { sku, deletedAt: null, ...notSelf },
      select: { name: true },
    });
    if (dup) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `SKU "${sku}" ja usado pelo produto "${dup.name}".`,
      });
    }
  }

  if (barcode) {
    const dup = await tx.product.findFirst({
      where: { barcode, deletedAt: null, ...notSelf },
      select: { name: true },
    });
    if (dup) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Codigo de barras "${barcode}" ja usado pelo produto "${dup.name}".`,
      });
    }
  }
}
