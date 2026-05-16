import type { PrismaClient } from "@prisma/client"

/**
 * Hybrid stock quantity resolution.
 *
 * - isSerialized=false: reads Product.currentStock (counter field, source of truth)
 * - isSerialized=true: counts StockItem with status=AVAILABLE (computed)
 *
 * This is the ONLY way to get available quantity. All consumers must use this.
 */
export async function getAvailableQuantity(
  tx: PrismaClient,
  tenantId: string,
  productId: string
): Promise<number> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { isSerialized: true, currentStock: true },
  })

  if (!product) return 0

  if (!product.isSerialized) {
    // Non-serialized: counter field is source of truth
    return product.currentStock
  }

  // Serialized: count StockItems with status AVAILABLE
  // StockItem model will be created in Estoque-B; until then return 0
  try {
    const count = await (tx as any).stockItem.count({
      where: {
        tenantId,
        productId,
        status: "AVAILABLE",
        deletedAt: null,
      },
    })
    return count
  } catch {
    // StockItem table doesn't exist yet (before Estoque-B migration)
    return 0
  }
}

/**
 * Get available quantity for a product variation (always serialized).
 */
export async function getVariationAvailableQuantity(
  tx: PrismaClient,
  tenantId: string,
  variationId: string
): Promise<number> {
  try {
    const count = await (tx as any).stockItem.count({
      where: {
        tenantId,
        variationId,
        status: "AVAILABLE",
        deletedAt: null,
      },
    })
    return count
  } catch {
    return 0
  }
}
