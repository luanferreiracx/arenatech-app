import { Prisma } from "@prisma/client"
import { resolveCurrentStockByProduct } from "@/server/services/stock-item.service"

/**
 * Quantidade disponivel de UM produto, cobrindo os tres tipos (serializado,
 * com variacoes, simples). Delega para resolveCurrentStockByProduct — a fonte
 * unica de estoque efetivo. Antes esta funcao so tratava serializado x simples
 * (ignorava variacoes) e engolia erro de banco como "0", mascarando falhas.
 */
export async function getAvailableQuantity(
  tx: Prisma.TransactionClient,
  _tenantId: string,
  productId: string
): Promise<number> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, isSerialized: true, hasVariations: true, currentStock: true },
  })

  if (!product) return 0

  const byProduct = await resolveCurrentStockByProduct(tx, [product])
  return byProduct.get(product.id) ?? 0
}
