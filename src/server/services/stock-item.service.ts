import type { PrismaClient } from "@prisma/client"
import { Prisma } from "@prisma/client"
import { TRPCError } from "@trpc/server"
import { isValidTransition } from "@/lib/validators/stock-item"
import { isValidLuhn } from "@/lib/validators/imei"

export type StockSourceProduct = {
  id: string
  currentStock: number
  hasVariations: boolean
  isSerialized: boolean
}

/**
 * Estoque efetivo por produto (fonte ÚNICA), cobrindo os três tipos:
 *  - serializado: COUNT(StockItem AVAILABLE, não deletado)
 *  - com variações: SUM(ProductVariation.currentStock) apenas ATIVAS/não deletadas
 *  - simples: products.currentStock
 *
 * Antes esta regra era reimplementada inline em stock.list, stock.getById e no
 * SQL do stockDashboard, com filtros divergentes (list/getById esqueciam
 * `active:true` nas variações), então o MESMO produto mostrava estoque diferente
 * entre a listagem e os relatórios. Centralizado aqui.
 */
export async function resolveCurrentStockByProduct(
  tx: Prisma.TransactionClient,
  products: StockSourceProduct[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (products.length === 0) return result

  const serializedIds = products.filter((p) => p.isSerialized).map((p) => p.id)
  const variationIds = products
    .filter((p) => !p.isSerialized && p.hasVariations)
    .map((p) => p.id)

  const [serializedCounts, variationSums] = await Promise.all([
    serializedIds.length > 0
      ? tx.stockItem.groupBy({
          by: ["productId"],
          where: { productId: { in: serializedIds }, status: "AVAILABLE", deletedAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    variationIds.length > 0
      ? tx.productVariation.groupBy({
          by: ["productId"],
          where: { productId: { in: variationIds }, deletedAt: null, active: true },
          _sum: { currentStock: true },
        })
      : Promise.resolve([]),
  ])

  const serializedMap = new Map(serializedCounts.map((row) => [row.productId, row._count._all]))
  const variationMap = new Map(variationSums.map((row) => [row.productId, row._sum.currentStock ?? 0]))

  for (const product of products) {
    if (product.isSerialized) result.set(product.id, serializedMap.get(product.id) ?? 0)
    else if (product.hasVariations) result.set(product.id, variationMap.get(product.id) ?? 0)
    else result.set(product.id, product.currentStock)
  }
  return result
}

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
  // Pré-valida IMEIs ANTES do bulk insert: Luhn + duplicado no próprio lote +
  // já-cadastrado em estoque (não-deletado). Sem isto, um IMEI repetido estouraria
  // o índice único parcial `stock_items_tenant_imei_unique` com um P2002 cru. O
  // índice só considera `imei IS NOT NULL AND deleted_at IS NULL` — checamos isso.
  const normalizedImeis = params.items
    .map((item) => (item.imei ? item.imei.replace(/\D/g, "") : null))
    .filter((v): v is string => !!v)
  if (normalizedImeis.length > 0) {
    for (const imei of normalizedImeis) {
      if (imei.length !== 15 || !isValidLuhn(imei)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `IMEI invalido: ${imei} (precisa de 15 digitos e passar Luhn).`,
        })
      }
    }
    const seen = new Set<string>()
    for (const imei of normalizedImeis) {
      if (seen.has(imei)) {
        throw new TRPCError({ code: "CONFLICT", message: `IMEI repetido no lote: ${imei}.` })
      }
      seen.add(imei)
    }
    const existing = await tx.stockItem.findFirst({
      where: { tenantId, imei: { in: normalizedImeis }, deletedAt: null },
      select: { imei: true, status: true },
    })
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `IMEI ja cadastrado no estoque: ${existing.imei} (status ${existing.status}).`,
      })
    }
  }

  // Bulk insert: createManyAndReturn evita N round-trips no DB.
  // Ganho real em imports grandes (50+ aparelhos).
  const costDecimal = new Prisma.Decimal(params.costPrice).div(100)
  const suggestedSaleDecimal = params.suggestedSalePrice
    ? new Prisma.Decimal(params.suggestedSalePrice).div(100)
    : null

  const created = await tx.stockItem.createManyAndReturn({
    data: params.items.map((item) => ({
      tenantId,
      productId: params.productId,
      variationId: params.variationId || null,
      supplierId: params.supplierId || null,
      imei: item.imei ? item.imei.replace(/\D/g, "") : null,
      serialNumber: item.serialNumber || null,
      condition: params.condition as never,
      conservationGrade: params.conservationGrade || null,
      batteryHealth: item.batteryHealth,
      warrantyMonths: item.warrantyMonths,
      costPrice: costDecimal,
      suggestedSalePrice: suggestedSaleDecimal,
      invoiceNumber: params.invoiceNumber || null,
      status: "AVAILABLE" as const,
      notes: item.notes || null,
    })),
    select: { id: true },
  })

  await tx.stockMovement.createMany({
    data: created.map((s) => ({
      tenantId,
      productId: params.productId,
      variationId: params.variationId || null,
      stockItemId: s.id,
      type: "ENTRY" as const,
      quantity: 1,
      reason: params.invoiceNumber
        ? `Entrada NF ${params.invoiceNumber}`
        : "Entrada manual",
      userId,
    })),
  })

  return created.map((s) => s.id)
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

  // Compare-and-set atomico: o WHERE currentStock >= quantity evita oversell sob
  // concorrencia (dois EXIT simultaneos nao baixam abaixo de zero). Antes era
  // read-check-write nao-atomico (TOCTOU).
  const updated = await tx.product.updateMany({
    where: { id: params.productId, currentStock: { gte: params.quantity } },
    data: { currentStock: { decrement: params.quantity } },
  })
  if (updated.count !== 1) {
    throw new Error("Estoque insuficiente")
  }

  const before = product.currentStock

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

  // Serializados nao tem saldo agregado: currentStock deriva de
  // count(StockItem AVAILABLE). Setar currentStock direto aqui corromperia o
  // saldo exibido. A baixa/entrada de serializado e por StockItem (compra,
  // venda, descarte) — nao por ajuste de quantidade.
  if (product.isSerialized) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `"${product.name}" e um produto serializado — ajuste o estoque pelo item (IMEI/serie), nao por quantidade.`,
    })
  }

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

  // CAS de status: só aplica se o status ainda for o que validamos a transição.
  // Duas mudanças de status concorrentes do mesmo item — a segunda vê count=0 e
  // aborta, em vez de sobrescrever (ex.: reservar um item que já virou SOLD).
  const casResult = await tx.stockItem.updateMany({
    where: { id: params.stockItemId, status: item.status },
    data: updateData,
  })
  if (casResult.count !== 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "O status do item mudou em outra operacao. Atualize e tente novamente.",
    })
  }

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

/**
 * Baixa/descarte de um StockItem serializado: tira a unidade do estoque de vez
 * (soft delete) e registra o movimento de saida com motivo. Usado quando o
 * aparelho vira perda total (nao sera vendido). Difere de marcar DEFECTIVE, que
 * mantem a unidade no estoque (pode ser vendida "como esta" pelo PDV depois).
 *
 * So permite descartar itens que estao no estoque (AVAILABLE/DEFECTIVE/BLOCKED/
 * RETURNED). SOLD e RESERVED tem fluxo proprio (estorno/liberacao) e nao podem
 * ser descartados direto — evita apagar rastro de uma venda/reserva ativa.
 */
const DISPOSABLE_STATUSES = new Set(["AVAILABLE", "DEFECTIVE", "BLOCKED", "RETURNED"])

export async function disposeStockItem(
  tx: PrismaClient,
  tenantId: string,
  userId: string,
  params: { stockItemId: string; reason: string }
): Promise<void> {
  const item = await tx.stockItem.findUniqueOrThrow({
    where: { id: params.stockItemId },
  })

  if (item.deletedAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Este item ja foi baixado." })
  }
  if (!DISPOSABLE_STATUSES.has(item.status)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        item.status === "SOLD"
          ? "Item vendido: a baixa e feita por estorno da venda, nao por descarte."
          : item.status === "RESERVED"
            ? "Item reservado: libere a reserva antes de descartar."
            : `Nao e possivel descartar um item no status ${item.status}.`,
    })
  }

  await tx.stockItem.update({
    where: { id: params.stockItemId },
    data: { status: "DEFECTIVE", deletedAt: new Date() },
  })

  await tx.stockMovement.create({
    data: {
      tenantId,
      productId: item.productId,
      variationId: item.variationId,
      stockItemId: params.stockItemId,
      type: "EXIT",
      quantity: 1,
      reason: params.reason,
      referenceType: "dispose",
      userId,
    },
  })
}

/**
 * Libera reservas de StockItem presas: ao adicionar um aparelho ao carrinho do
 * PDV, ele vira RESERVED (reservedForType="sale"). Se o vendedor fecha o
 * navegador sem finalizar nem abandonar, o aparelho ficava preso para sempre —
 * nao havia limpeza. Este job devolve para AVAILABLE os itens RESERVED ha mais
 * de `staleMinutes` cuja venda de origem ainda esta em DRAFT (nao finalizada).
 *
 * Cross-tenant: chamado pelo cron com withAdmin (BYPASSRLS). Idempotente.
 */
export async function releaseStaleReservations(
  tx: PrismaClient,
  staleMinutes = 30,
): Promise<{ releasedCount: number }> {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000)

  // Candidatos: RESERVED para venda, com reserva antiga. Confirmamos que a venda
  // de origem ainda esta DRAFT (uma venda finalizada marca o item SOLD; se ainda
  // RESERVED apos finalizar seria outro bug, mas nao liberamos por seguranca).
  const stale = await tx.stockItem.findMany({
    where: {
      status: "RESERVED",
      reservedForType: "sale",
      reservedAt: { lt: cutoff },
      deletedAt: null,
    },
    select: { id: true, reservedForId: true },
  })
  if (stale.length === 0) return { releasedCount: 0 }

  const saleIds = [...new Set(stale.map((s) => s.reservedForId).filter((v): v is string => !!v))]
  const activeDrafts = await tx.sale.findMany({
    where: { id: { in: saleIds }, status: "DRAFT", deletedAt: null },
    select: { id: true },
  })
  const draftSet = new Set(activeDrafts.map((s) => s.id))

  // Libera: reserva sem venda (orfa) OU reserva de venda ainda em DRAFT.
  const releasableIds = stale
    .filter((s) => !s.reservedForId || draftSet.has(s.reservedForId))
    .map((s) => s.id)
  if (releasableIds.length === 0) return { releasedCount: 0 }

  const result = await tx.stockItem.updateMany({
    where: { id: { in: releasableIds }, status: "RESERVED" },
    data: { status: "AVAILABLE", reservedForType: null, reservedForId: null, reservedAt: null },
  })
  return { releasedCount: result.count }
}
