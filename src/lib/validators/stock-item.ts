import { z } from "zod"
import { imeiSchema } from "./imei"

// ── StockItem schemas ──

export const stockItemConditionEnum = z.enum(["NEW", "SEMI_NEW", "USED", "DISPLAY"])
export const stockItemStatusEnum = z.enum(["AVAILABLE", "RESERVED", "SOLD", "DEFECTIVE", "RETURNED", "BLOCKED"])
export const conservationGradeEnum = z.enum(["A", "B", "C", "D"])

export const createStockItemSchema = z.object({
  productId: z.string().uuid(),
  variationId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  imei: imeiSchema.optional().nullable(),
  serialNumber: z.string().min(4).max(30).optional().nullable(),
  barcode: z.string().max(50).optional().nullable(),
  condition: stockItemConditionEnum,
  conservationGrade: conservationGradeEnum.optional().nullable(),
  batteryHealth: z.number().int().min(0).max(100).optional().nullable(),
  warrantyMonths: z.number().int().min(0).optional().nullable(),
  costPrice: z.number().int().min(0), // centavos
  suggestedSalePrice: z.number().int().min(0).optional().nullable(), // centavos
  invoiceNumber: z.string().max(50).optional().nullable(),
  entryDate: z.string().optional(), // ISO date string
  notes: z.string().max(2000).optional().nullable(),
})

export type CreateStockItemInput = z.infer<typeof createStockItemSchema>

export const createStockItemBatchSchema = z.object({
  productId: z.string().uuid(),
  variationId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  condition: stockItemConditionEnum,
  conservationGrade: conservationGradeEnum.optional().nullable(),
  costPrice: z.number().int().min(0),
  suggestedSalePrice: z.number().int().min(0).optional().nullable(),
  invoiceNumber: z.string().max(50).optional().nullable(),
  items: z.array(z.object({
    imei: imeiSchema.optional().nullable(),
    serialNumber: z.string().min(4).max(30).optional().nullable(),
    batteryHealth: z.number().int().min(0).max(100).optional().nullable(),
    warrantyMonths: z.number().int().min(0).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })).min(1, "Pelo menos 1 item obrigatorio"),
})

export type CreateStockItemBatchInput = z.infer<typeof createStockItemBatchSchema>

// ── Entry for non-serialized (quantity-based) ──

export const stockEntryQuantitySchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1, "Quantidade minima 1"),
  supplierId: z.string().uuid().optional().nullable(),
  costPrice: z.number().int().min(0).optional(), // centavos per unit
  invoiceNumber: z.string().max(50).optional().nullable(),
  reason: z.string().min(3, "Motivo obrigatorio").max(200),
})

export type StockEntryQuantityInput = z.infer<typeof stockEntryQuantitySchema>

// ── Exit/write-off ──

export const stockWriteOffSchema = z.object({
  productId: z.string().uuid(),
  stockItemId: z.string().uuid().optional().nullable(), // for serialized
  quantity: z.number().int().min(1).optional(), // for non-serialized
  reason: z.string().min(3, "Motivo obrigatorio").max(200),
})

export type StockWriteOffInput = z.infer<typeof stockWriteOffSchema>

// ── Adjustment ──

export const stockAdjustmentSchema = z.object({
  productId: z.string().uuid(),
  newQuantity: z.number().int().min(0, "Quantidade nao pode ser negativa"),
  reason: z.string().min(3, "Motivo obrigatorio").max(200),
})

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>

// ── Status change ──

export const changeStockItemStatusSchema = z.object({
  stockItemId: z.string().uuid(),
  newStatus: stockItemStatusEnum,
  reason: z.string().min(3).max(200).optional(),
  // For reservations
  reservedForType: z.string().max(50).optional().nullable(),
  reservedForId: z.string().uuid().optional().nullable(),
})

export type ChangeStockItemStatusInput = z.infer<typeof changeStockItemStatusSchema>

// ── Baixa/descarte de unidade serializada ──
// Motivo obrigatorio: baixa de patrimonio precisa de justificativa rastreavel.
export const disposeStockItemSchema = z.object({
  stockItemId: z.string().uuid(),
  reason: z.string().min(3, "Descreva o motivo da baixa").max(200),
})

export type DisposeStockItemInput = z.infer<typeof disposeStockItemSchema>

// ── List/filter ──

export const listStockItemsSchema = z.object({
  productId: z.string().uuid().optional(),
  status: stockItemStatusEnum.optional(),
  condition: stockItemConditionEnum.optional(),
  supplierId: z.string().uuid().optional(),
  search: z.string().optional(), // IMEI, serial, barcode
  /** Busca por nome/marca do produto (paridade Laravel `buscarItensDisponiveis`). */
  productSearch: z.string().optional(),
  /** Atalho para status=AVAILABLE — util para PDV listar disponiveis. */
  availableOnly: z.boolean().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

export type ListStockItemsInput = z.infer<typeof listStockItemsSchema>

// ── IMEI search ──

export const searchImeiSchema = z.object({
  imei: z.string().min(1).max(20),
})

export type SearchImeiInput = z.infer<typeof searchImeiSchema>

// ── Labels ──

export const stockItemStatusLabels: Record<string, string> = {
  AVAILABLE: "Disponivel",
  RESERVED: "Reservado",
  SOLD: "Vendido",
  DEFECTIVE: "Defeito",
  RETURNED: "Devolvido",
  BLOCKED: "Bloqueado",
}

export const stockItemConditionLabels: Record<string, string> = {
  NEW: "Novo",
  SEMI_NEW: "Seminovo",
  USED: "Usado",
  DISPLAY: "Vitrine",
}

export const conservationGradeLabels: Record<string, string> = {
  A: "Excelente",
  B: "Bom",
  C: "Regular",
  D: "Ruim",
}

// ── Status transitions (state machine) ──

export const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE: ["RESERVED", "SOLD", "DEFECTIVE", "BLOCKED"],
  RESERVED: ["AVAILABLE", "SOLD"],
  SOLD: ["RETURNED"],
  DEFECTIVE: ["AVAILABLE", "BLOCKED"],
  RETURNED: ["AVAILABLE", "DEFECTIVE", "BLOCKED"],
  BLOCKED: ["AVAILABLE", "DEFECTIVE"],
}

export function isValidTransition(currentStatus: string, newStatus: string): boolean {
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus]
  if (!allowed) return false
  return allowed.includes(newStatus)
}

// ── Recompra de aparelho ──

/**
 * Status de StockItem que permitem RECOMPRA do mesmo IMEI (a loja vendeu/
 * descartou o aparelho e agora o compra de volta do cliente).
 *
 * SOLD: aparelho vendido — cliente quer revender de volta (caso reportado).
 * DEFECTIVE: aparelho que saiu de circulacao por defeito; pode ser recomprado
 *            (ex: cliente devolve com defeito e a loja recompra para conserto).
 *
 * AVAILABLE/RESERVED/BLOCKED indicam que o aparelho AINDA esta em circulacao no
 * estoque — um cadastro novo com o mesmo IMEI e duplicidade real, nao recompra.
 */
const REPURCHASABLE_STATUSES = new Set(["SOLD", "DEFECTIVE"])

export function isRepurchasableStatus(status: string): boolean {
  return REPURCHASABLE_STATUSES.has(status)
}

// ── Cancelamento de compra de aparelho ──

/**
 * Status de StockItem que o cancelamento de uma compra pode liberar (soft delete)
 * para devolver o IMEI ao pool.
 *
 * BLOCKED: estado inicial apos createPurchase (aguarda termo de responsabilidade).
 *          Cancelar antes de assinar precisa liberar este — antes a busca so
 *          considerava AVAILABLE, deixando o item BLOCKED orfao e o IMEI preso.
 * AVAILABLE: termo ja assinado e item liberado, mas a compra ainda nao foi
 *            consumida por uma venda.
 *
 * SOLD/RESERVED ficam de fora: ja foram para uma venda/reserva, que tem fluxo
 * proprio de estorno/liberacao — cancelar a compra nao deve apagar esse rastro.
 */
export const PURCHASE_REVERSIBLE_STATUSES = ["BLOCKED", "AVAILABLE"] as const

export function isPurchaseReversibleStatus(status: string): boolean {
  return (PURCHASE_REVERSIBLE_STATUSES as readonly string[]).includes(status)
}
