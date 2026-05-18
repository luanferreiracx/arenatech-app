import { getAvailableQuantity } from "@/server/services/product.service"

// Use `any` for tx type to support both PrismaClient and Omit<PrismaClient, ...>
// from withTenant() transactions. This matches the pattern used across the codebase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = any

/**
 * OS Stock Service — Reserve/release stock for ServiceOrder items.
 *
 * Follows Laravel's OrdemServicoEstoqueService pattern:
 * - addItem PRODUCT → reserve (decrement currentStock, create RESERVE movement)
 * - removeItem PRODUCT → release (increment currentStock, create RELEASE movement)
 * - cancel OS → release all product items
 *
 * Only applies to non-serialized products (isSerialized=false).
 * Serialized products use StockItem status changes via changeItemStatus().
 */

/**
 * Reserve stock for a product item added to an OS.
 * Decrements Product.currentStock and creates a RESERVE StockMovement.
 */
export async function reserveStockForOsItem(
  tx: TxClient,
  tenantId: string,
  userId: string,
  params: {
    productId: string
    quantity: number
    orderId: string
    itemDescription: string
  }
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: params.productId },
    select: { id: true, isSerialized: true, currentStock: true, name: true },
  })

  if (!product) return // product may have been deleted

  if (product.isSerialized) {
    // Serialized products: StockItem reservation handled separately (future)
    // For now, skip — OS items with serialized products are rare
    return
  }

  // Validate stock availability
  const available = await getAvailableQuantity(tx, tenantId, params.productId)
  if (available < params.quantity) {
    throw new Error(
      `Estoque insuficiente para "${product.name}": disponível ${available}, solicitado ${params.quantity}`
    )
  }

  const before = product.currentStock

  // Decrement stock
  await tx.product.update({
    where: { id: params.productId },
    data: { currentStock: { decrement: params.quantity } },
  })

  // Create RESERVE movement
  await tx.stockMovement.create({
    data: {
      tenantId,
      productId: params.productId,
      type: "RESERVE",
      quantity: params.quantity,
      quantityBefore: before,
      quantityAfter: before - params.quantity,
      reason: `Reserva para OS: ${params.itemDescription}`,
      referenceType: "service_order",
      referenceId: params.orderId,
      userId,
    },
  })
}

/**
 * Release stock for a product item removed from an OS.
 * Increments Product.currentStock and creates a RELEASE StockMovement.
 */
export async function releaseStockForOsItem(
  tx: TxClient,
  tenantId: string,
  userId: string,
  params: {
    productId: string
    quantity: number
    orderId: string
    reason: string
  }
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: params.productId },
    select: { id: true, isSerialized: true, currentStock: true },
  })

  if (!product) return // product may have been deleted

  if (product.isSerialized) {
    // Serialized: handled separately (future)
    return
  }

  const before = product.currentStock

  // Increment stock
  await tx.product.update({
    where: { id: params.productId },
    data: { currentStock: { increment: params.quantity } },
  })

  // Create RELEASE movement
  await tx.stockMovement.create({
    data: {
      tenantId,
      productId: params.productId,
      type: "RELEASE",
      quantity: params.quantity,
      quantityBefore: before,
      quantityAfter: before + params.quantity,
      reason: params.reason,
      referenceType: "service_order",
      referenceId: params.orderId,
      userId,
    },
  })
}

/**
 * Release all reserved product items for a cancelled OS.
 */
export async function releaseAllOsItems(
  tx: TxClient,
  tenantId: string,
  userId: string,
  orderId: string
): Promise<number> {
  const items = await tx.serviceOrderItem.findMany({
    where: { orderId, type: "PRODUCT" },
  })

  let released = 0

  for (const item of items) {
    if (!item.productId) continue

    const quantity = Number(item.quantity)
    if (quantity <= 0) continue

    await releaseStockForOsItem(tx, tenantId, userId, {
      productId: item.productId,
      quantity,
      orderId,
      reason: `Estoque liberado — OS cancelada: ${item.description}`,
    })

    released++
  }

  return released
}
