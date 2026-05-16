import type { PrismaClient } from "@prisma/client"
import { Prisma } from "@prisma/client"
import { isValidTransition } from "@/lib/validators/stock-item"

/**
 * Entry of serialized items (creates StockItem + StockMovement per item).
 */
export async function entrySerializedItems(
  tx: PrismaClient,
  tenantId: string,
  userId: string,
  params: {
    productId: string
    variationId?: string | null
    supplierId?: string | null
    condition: string
    conservationGrade?: string | null
    costPrice: number // centavos
    suggestedSalePrice?: number | null
    invoiceNumber?: string | null
    items: Array<{
      imei?: string | null
      serialNumber?: string | null
      batteryHealth?: number | null
      warrantyMonths?: number | null
      notes?: string | null
    }>
  }
): Promise<string[]> {
  const createdIds: string[] = []

  for (const item of params.items) {
    const stockItem = await tx.stockItem.create({
      data: {
        tenantId,
        productId: params.productId,
        variationId: params.variationId || null,
        supplierId: params.supplierId || null,
        imei: item.imei || null,
        serialNumber: item.serialNumber || null,
        condition: params.condition as any,
        conservationGrade: params.conservationGrade || null,
        batteryHealth: item.batteryHealth,
        warrantyMonths: item.warrantyMonths,
        costPrice: new Prisma.Decimal(params.costPrice).div(100),
        suggestedSalePrice: params.suggestedSalePrice
          ? new Prisma.Decimal(params.suggestedSalePrice).div(100)
          : null,
        invoiceNumber: params.invoiceNumber || null,
        status: "AVAILABLE",
        notes: item.notes || null,
      },
    })

    await tx.stockMovement.create({
      data: {
        tenantId,
        productId: params.productId,
        variationId: params.variationId || null,
        stockItemId: stockItem.id,
        type: "ENTRY",
        quantity: 1,
        reason: params.invoiceNumber
          ? `Entrada NF ${params.invoiceNumber}`
          : "Entrada manual",
        userId,
      },
    })

    createdIds.push(stockItem.id)
  }

  return createdIds
}

/**
 * Entry of non-serialized product (increments currentStock + creates StockMovement).
 */
export async function entryNonSerialized(
  tx: PrismaClient,
  tenantId: string,
  userId: string,
  params: {
    productId: string
    quantity: number
    reason: string
    supplierId?: string | null
    invoiceNumber?: string | null
  }
): Promise<void> {
  const product = await tx.product.findUniqueOrThrow({ where: { id: params.productId } })
  const before = product.currentStock

  await tx.product.update({
    where: { id: params.productId },
    data: { currentStock: { increment: params.quantity } },
  })

  await tx.stockMovement.create({
    data: {
      tenantId,
      productId: params.productId,
      type: "ENTRY",
      quantity: params.quantity,
      quantityBefore: before,
      quantityAfter: before + params.quantity,
      reason: params.reason,
      referenceType: params.supplierId ? "supplier" : null,
      referenceId: params.supplierId || null,
      userId,
    },
  })
}

/**
 * Exit/write-off for non-serialized (decrements currentStock).
 */
export async function exitNonSerialized(
  tx: PrismaClient,
  tenantId: string,
  userId: string,
  params: {
    productId: string
    quantity: number
    reason: string
    referenceType?: string | null
    referenceId?: string | null
  }
): Promise<void> {
  const product = await tx.product.findUniqueOrThrow({ where: { id: params.productId } })
  const before = product.currentStock

  if (before < params.quantity) {
    throw new Error("Estoque insuficiente")
  }

  await tx.product.update({
    where: { id: params.productId },
    data: { currentStock: { decrement: params.quantity } },
  })

  await tx.stockMovement.create({
    data: {
      tenantId,
      productId: params.productId,
      type: "EXIT",
      quantity: params.quantity,
      quantityBefore: before,
      quantityAfter: before - params.quantity,
      reason: params.reason,
      referenceType: params.referenceType || "manual",
      referenceId: params.referenceId || null,
      userId,
    },
  })
}

/**
 * Adjust inventory for non-serialized (sets new absolute quantity).
 */
export async function adjustInventory(
  tx: PrismaClient,
  tenantId: string,
  userId: string,
  params: {
    productId: string
    newQuantity: number
    reason: string
  }
): Promise<void> {
  const product = await tx.product.findUniqueOrThrow({ where: { id: params.productId } })
  const before = product.currentStock
  const diff = params.newQuantity - before

  if (diff === 0) return // no change

  await tx.product.update({
    where: { id: params.productId },
    data: { currentStock: params.newQuantity },
  })

  await tx.stockMovement.create({
    data: {
      tenantId,
      productId: params.productId,
      type: "ADJUSTMENT",
      quantity: Math.abs(diff),
      quantityBefore: before,
      quantityAfter: params.newQuantity,
      reason: params.reason,
      referenceType: "manual",
      userId,
    },
  })
}

/**
 * Change StockItem status with state machine validation.
 */
export async function changeItemStatus(
  tx: PrismaClient,
  tenantId: string,
  userId: string,
  params: {
    stockItemId: string
    newStatus: string
    reason?: string
    reservedForType?: string | null
    reservedForId?: string | null
  }
): Promise<void> {
  const item = await tx.stockItem.findUniqueOrThrow({
    where: { id: params.stockItemId },
  })

  if (!isValidTransition(item.status, params.newStatus)) {
    throw new Error(`Transicao invalida: ${item.status} → ${params.newStatus}`)
  }

  const updateData: any = { status: params.newStatus }

  // Handle reservation fields
  if (params.newStatus === "RESERVED") {
    updateData.reservedForType = params.reservedForType || null
    updateData.reservedForId = params.reservedForId || null
    updateData.reservedAt = new Date()
  } else if (item.status === "RESERVED") {
    // Clearing reservation
    updateData.reservedForType = null
    updateData.reservedForId = null
    updateData.reservedAt = null
  }

  // Handle sold
  if (params.newStatus === "SOLD") {
    updateData.soldAt = new Date()
  }

  await tx.stockItem.update({
    where: { id: params.stockItemId },
    data: updateData,
  })

  // Determine movement type
  let movementType: string
  if (params.newStatus === "RESERVED") {
    movementType = "RESERVE"
  } else if (item.status === "RESERVED" && params.newStatus === "AVAILABLE") {
    movementType = "RELEASE"
  } else if (params.newStatus === "SOLD") {
    movementType = "EXIT"
  } else {
    movementType = "ADJUSTMENT"
  }

  await tx.stockMovement.create({
    data: {
      tenantId,
      productId: item.productId,
      variationId: item.variationId,
      stockItemId: params.stockItemId,
      type: movementType as any,
      quantity: 1,
      reason: params.reason || `Status: ${item.status} → ${params.newStatus}`,
      userId,
    },
  })
}
