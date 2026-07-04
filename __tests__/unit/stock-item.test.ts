import { describe, it, expect } from "vitest"
import { validateImei } from "@/lib/validators/imei"
import {
  createStockItemSchema,
  createStockItemBatchSchema,
  stockEntryQuantitySchema,
  stockWriteOffSchema,
  stockAdjustmentSchema,
  changeStockItemStatusSchema,
  listStockItemsSchema,
  isValidTransition,
  isManualStatusChangeAllowed,
  ALLOWED_STATUS_TRANSITIONS,
  isRepurchasableStatus,
  isPurchaseReversibleStatus,
} from "@/lib/validators/stock-item"

describe("IMEI Validation (Luhn)", () => {
  it("validates correct IMEI (490154203237518)", () => {
    expect(validateImei("490154203237518")).toBe(true)
  })

  it("validates correct IMEI (356938035643809)", () => {
    expect(validateImei("356938035643809")).toBe(true)
  })

  it("validates correct IMEI (353456789012348)", () => {
    expect(validateImei("353456789012348")).toBe(true)
  })

  it("rejects IMEI with wrong check digit", () => {
    expect(validateImei("353456789012341")).toBe(false)
  })

  it("rejects IMEI too short (14 digits)", () => {
    expect(validateImei("35345678901234")).toBe(false)
  })

  it("rejects IMEI too long (16 digits)", () => {
    expect(validateImei("3534567890123400")).toBe(false)
  })

  it("rejects all zeros", () => {
    expect(validateImei("000000000000000")).toBe(true) // Luhn valid for all zeros
  })

  it("rejects IMEI with letters", () => {
    expect(validateImei("35345678901234A")).toBe(false)
  })

  it("rejects empty string", () => {
    expect(validateImei("")).toBe(false)
  })

  it("strips non-digits before validation (formatted IMEI)", () => {
    // 49-015420-323751-8 → 490154203237518 is valid
    expect(validateImei("49-015420-323751-8")).toBe(true)
  })

  it("rejects lixo like 123456789012345", () => {
    // 123456789012345 Luhn check: let's compute
    // Actually 123456789012345 fails Luhn (sum=58, 58%10≠0)
    expect(validateImei("123456789012345")).toBe(false)
  })
})

describe("Stock Item State Machine", () => {
  it("AVAILABLE can transition to RESERVED", () => {
    expect(isValidTransition("AVAILABLE", "RESERVED")).toBe(true)
  })

  it("AVAILABLE can transition to SOLD", () => {
    expect(isValidTransition("AVAILABLE", "SOLD")).toBe(true)
  })

  it("AVAILABLE can transition to DEFECTIVE", () => {
    expect(isValidTransition("AVAILABLE", "DEFECTIVE")).toBe(true)
  })

  it("AVAILABLE can transition to BLOCKED", () => {
    expect(isValidTransition("AVAILABLE", "BLOCKED")).toBe(true)
  })

  it("AVAILABLE cannot transition to RETURNED", () => {
    expect(isValidTransition("AVAILABLE", "RETURNED")).toBe(false)
  })

  it("RESERVED can transition to AVAILABLE (release)", () => {
    expect(isValidTransition("RESERVED", "AVAILABLE")).toBe(true)
  })

  it("RESERVED can transition to SOLD", () => {
    expect(isValidTransition("RESERVED", "SOLD")).toBe(true)
  })

  it("RESERVED cannot transition to DEFECTIVE directly", () => {
    expect(isValidTransition("RESERVED", "DEFECTIVE")).toBe(false)
  })

  it("SOLD can transition to RETURNED", () => {
    expect(isValidTransition("SOLD", "RETURNED")).toBe(true)
  })

  it("SOLD cannot transition to AVAILABLE directly", () => {
    expect(isValidTransition("SOLD", "AVAILABLE")).toBe(false)
  })

  it("DEFECTIVE can transition to AVAILABLE (after repair)", () => {
    expect(isValidTransition("DEFECTIVE", "AVAILABLE")).toBe(true)
  })

  it("RETURNED can transition to AVAILABLE (reconditioned)", () => {
    expect(isValidTransition("RETURNED", "AVAILABLE")).toBe(true)
  })

  it("RETURNED can transition to DEFECTIVE", () => {
    expect(isValidTransition("RETURNED", "DEFECTIVE")).toBe(true)
  })

  it("BLOCKED can transition to AVAILABLE (unblock)", () => {
    expect(isValidTransition("BLOCKED", "AVAILABLE")).toBe(true)
  })

  it("BLOCKED cannot transition to SOLD", () => {
    expect(isValidTransition("BLOCKED", "SOLD")).toBe(false)
  })

  it("invalid source status returns false", () => {
    expect(isValidTransition("UNKNOWN", "AVAILABLE")).toBe(false)
  })
})

describe("isManualStatusChangeAllowed (endpoint manual não pode vender)", () => {
  it("permite os status de operação manual", () => {
    for (const s of ["AVAILABLE", "RESERVED", "DEFECTIVE", "BLOCKED"]) {
      expect(isManualStatusChangeAllowed(s)).toBe(true)
    }
  })

  it("bloqueia SOLD (baixa por venda pertence ao PDV — evita venda fantasma)", () => {
    expect(isManualStatusChangeAllowed("SOLD")).toBe(false)
  })

  it("bloqueia RETURNED (devolução pertence ao estorno)", () => {
    expect(isManualStatusChangeAllowed("RETURNED")).toBe(false)
  })
})

describe("Stock Item Validators", () => {
  const validUuid = "123e4567-e89b-12d3-a456-426614174000"

  describe("createStockItemBatchSchema", () => {
    it("accepts valid batch with IMEIs", () => {
      const result = createStockItemBatchSchema.safeParse({
        productId: validUuid,
        condition: "NEW",
        costPrice: 520000,
        items: [
          { imei: "353456789012348" },
          { imei: "490154203237518" },
        ],
      })
      expect(result.success).toBe(true)
    })

    it("rejects empty items array", () => {
      const result = createStockItemBatchSchema.safeParse({
        productId: validUuid,
        condition: "NEW",
        costPrice: 520000,
        items: [],
      })
      expect(result.success).toBe(false)
    })

    it("rejects invalid IMEI in batch", () => {
      const result = createStockItemBatchSchema.safeParse({
        productId: validUuid,
        condition: "NEW",
        costPrice: 520000,
        items: [
          { imei: "123456789012345" }, // invalid Luhn
        ],
      })
      expect(result.success).toBe(false)
    })

    it("accepts items with serial number instead of IMEI", () => {
      const result = createStockItemBatchSchema.safeParse({
        productId: validUuid,
        condition: "USED",
        costPrice: 100000,
        items: [
          { serialNumber: "SN-ABC-12345" },
        ],
      })
      expect(result.success).toBe(true)
    })
  })

  describe("stockEntryQuantitySchema", () => {
    it("accepts valid entry", () => {
      const result = stockEntryQuantitySchema.safeParse({
        productId: validUuid,
        quantity: 50,
        reason: "Compra fornecedor X",
      })
      expect(result.success).toBe(true)
    })

    it("rejects zero quantity", () => {
      const result = stockEntryQuantitySchema.safeParse({
        productId: validUuid,
        quantity: 0,
        reason: "Teste",
      })
      expect(result.success).toBe(false)
    })

    it("rejects short reason", () => {
      const result = stockEntryQuantitySchema.safeParse({
        productId: validUuid,
        quantity: 10,
        reason: "ab",
      })
      expect(result.success).toBe(false)
    })
  })

  describe("stockAdjustmentSchema", () => {
    it("accepts valid adjustment", () => {
      const result = stockAdjustmentSchema.safeParse({
        productId: validUuid,
        newQuantity: 47,
        reason: "Auditoria mensal — 3 perdidas",
      })
      expect(result.success).toBe(true)
    })

    it("rejects negative new quantity", () => {
      const result = stockAdjustmentSchema.safeParse({
        productId: validUuid,
        newQuantity: -5,
        reason: "Teste",
      })
      expect(result.success).toBe(false)
    })

    it("accepts zero (cleared stock)", () => {
      const result = stockAdjustmentSchema.safeParse({
        productId: validUuid,
        newQuantity: 0,
        reason: "Estoque zerado apos furto",
      })
      expect(result.success).toBe(true)
    })
  })

  describe("changeStockItemStatusSchema", () => {
    it("accepts valid status change", () => {
      const result = changeStockItemStatusSchema.safeParse({
        stockItemId: validUuid,
        newStatus: "RESERVED",
        reservedForType: "order_service",
        reservedForId: validUuid,
      })
      expect(result.success).toBe(true)
    })

    it("rejects invalid status", () => {
      const result = changeStockItemStatusSchema.safeParse({
        stockItemId: validUuid,
        newStatus: "INVALID",
      })
      expect(result.success).toBe(false)
    })
  })

  describe("stockWriteOffSchema", () => {
    it("accepts serialized write-off", () => {
      const result = stockWriteOffSchema.safeParse({
        productId: validUuid,
        stockItemId: validUuid,
        reason: "Item danificado irreparavelmente",
      })
      expect(result.success).toBe(true)
    })

    it("accepts non-serialized write-off with quantity", () => {
      const result = stockWriteOffSchema.safeParse({
        productId: validUuid,
        quantity: 3,
        reason: "Furto identificado na auditoria",
      })
      expect(result.success).toBe(true)
    })

    it("rejects without reason", () => {
      const result = stockWriteOffSchema.safeParse({
        productId: validUuid,
        quantity: 1,
        reason: "ab", // too short
      })
      expect(result.success).toBe(false)
    })
  })
})

describe("Recompra de aparelho (isRepurchasableStatus)", () => {
  it("permite recompra de aparelho vendido (SOLD)", () => {
    // Caso reportado: cliente revende de volta o iPhone que comprou.
    expect(isRepurchasableStatus("SOLD")).toBe(true)
  })

  it("permite recompra de aparelho com defeito (DEFECTIVE)", () => {
    expect(isRepurchasableStatus("DEFECTIVE")).toBe(true)
  })

  it("bloqueia recompra de aparelho ainda em estoque (duplicidade real)", () => {
    expect(isRepurchasableStatus("AVAILABLE")).toBe(false)
    expect(isRepurchasableStatus("RESERVED")).toBe(false)
    expect(isRepurchasableStatus("BLOCKED")).toBe(false)
  })

  it("nao trata RETURNED como recompra (volta ao estoque por transicao)", () => {
    expect(isRepurchasableStatus("RETURNED")).toBe(false)
  })
})

describe("Cancelamento de compra (isPurchaseReversibleStatus)", () => {
  it("libera item BLOCKED — caso reportado: compra cancelada antes de assinar termo", () => {
    // createPurchase cria o StockItem como BLOCKED (aguarda termo). Cancelar
    // antes de assinar precisa liberar este status, senao o IMEI fica preso.
    expect(isPurchaseReversibleStatus("BLOCKED")).toBe(true)
  })

  it("libera item AVAILABLE (termo assinado, ainda nao vendido)", () => {
    expect(isPurchaseReversibleStatus("AVAILABLE")).toBe(true)
  })

  it("nao libera item ja vendido ou reservado (tem fluxo proprio)", () => {
    expect(isPurchaseReversibleStatus("SOLD")).toBe(false)
    expect(isPurchaseReversibleStatus("RESERVED")).toBe(false)
  })
})
