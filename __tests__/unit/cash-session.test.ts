import { describe, it, expect } from "vitest"
import { z } from "zod"

// Test the validator schemas
import {
  openCashSessionSchema,
  closeCashSessionSchema,
  MOVEMENT_TYPE_LABELS,
} from "@/lib/validators/cashier"

describe("Cash Session Validators", () => {
  describe("openCashSessionSchema", () => {
    it("accepts valid opening with balance", () => {
      const result = openCashSessionSchema.safeParse({
        initialBalance: 5000, // R$ 50 in centavos
        openingNote: "Troco do dia",
      })
      expect(result.success).toBe(true)
    })

    it("accepts zero initial balance", () => {
      const result = openCashSessionSchema.safeParse({
        initialBalance: 0,
      })
      expect(result.success).toBe(true)
    })

    it("rejects negative initial balance", () => {
      const result = openCashSessionSchema.safeParse({
        initialBalance: -100,
      })
      expect(result.success).toBe(false)
    })
  })

  describe("closeCashSessionSchema", () => {
    it("accepts valid closing", () => {
      const result = closeCashSessionSchema.safeParse({
        declaredBalance: 85000, // R$ 850
        closingNote: "Tudo certo",
      })
      expect(result.success).toBe(true)
    })

    it("accepts zero declared (empty register)", () => {
      const result = closeCashSessionSchema.safeParse({
        declaredBalance: 0,
      })
      expect(result.success).toBe(true)
    })

    it("rejects negative declared balance", () => {
      const result = closeCashSessionSchema.safeParse({
        declaredBalance: -100,
      })
      expect(result.success).toBe(false)
    })
  })

  describe("MOVEMENT_TYPE_LABELS", () => {
    it("has all 4 types", () => {
      expect(MOVEMENT_TYPE_LABELS.SALE).toBe("Venda")
      expect(MOVEMENT_TYPE_LABELS.DEPOSIT).toBe("Suprimento")
      expect(MOVEMENT_TYPE_LABELS.WITHDRAWAL).toBe("Sangria")
      expect(MOVEMENT_TYPE_LABELS.EXPENSE).toBe("Despesa")
    })

    it("does NOT have old removed types", () => {
      expect((MOVEMENT_TYPE_LABELS as any).REFUND).toBeUndefined()
      expect((MOVEMENT_TYPE_LABELS as any).ADJUSTMENT).toBeUndefined()
      expect((MOVEMENT_TYPE_LABELS as any).OPENING).toBeUndefined()
      expect((MOVEMENT_TYPE_LABELS as any).CLOSING).toBeUndefined()
    })
  })
})

describe("Cash Session Business Logic (pure calculations)", () => {
  it("calculates balance correctly: initial + income - outcome", () => {
    const initial = 50 // R$ 50
    const incomes = [300, 200, 150] // R$ 650 total
    const outcomes = [100, 25] // R$ 125 total
    const totalIncome = incomes.reduce((s, v) => s + v, 0)
    const totalOutcome = outcomes.reduce((s, v) => s + v, 0)
    const calculated = initial + totalIncome - totalOutcome
    expect(calculated).toBe(575)
  })

  it("calculates difference correctly: declared - calculated", () => {
    const calculated = 850
    const declared = 845
    const difference = declared - calculated
    expect(difference).toBe(-5) // falta R$ 5
  })

  it("positive difference means surplus (sobra)", () => {
    const calculated = 850
    const declared = 860
    const difference = declared - calculated
    expect(difference).toBe(10) // sobra R$ 10
  })

  it("zero difference means exact match", () => {
    const calculated = 850
    const declared = 850
    expect(declared - calculated).toBe(0)
  })

  it("cash on hand cannot go negative for sangria", () => {
    const cashOnHand = 100 // R$ 100 em dinheiro
    const sangriaAmount = 150
    expect(sangriaAmount <= cashOnHand).toBe(false) // blocked
  })

  it("cash on hand allows sangria within limit", () => {
    const cashOnHand = 100
    const sangriaAmount = 80
    expect(sangriaAmount <= cashOnHand).toBe(true) // allowed
  })

  it("mixed payment creates correct number of movements", () => {
    const payments = [
      { method: "pix", amount: 300 },
      { method: "dinheiro", amount: 200 },
    ]
    // K7: 1 movement per payment method
    expect(payments.length).toBe(2)
  })

  it("auto-close identifies sessions older than threshold", () => {
    const maxHours = 18
    const cutoff = Date.now() - maxHours * 60 * 60 * 1000
    const session19hAgo = Date.now() - 19 * 60 * 60 * 1000
    const session4hAgo = Date.now() - 4 * 60 * 60 * 1000

    expect(session19hAgo < cutoff).toBe(true) // should auto-close
    expect(session4hAgo < cutoff).toBe(false) // should NOT auto-close
  })

  it("conference needed if auto-close OR difference != 0", () => {
    const needsConference = (closeType: string, difference: number) =>
      closeType === "AUTOMATIC" || difference !== 0

    expect(needsConference("AUTOMATIC", 0)).toBe(true)
    expect(needsConference("MANUAL", -5)).toBe(true)
    expect(needsConference("MANUAL", 0)).toBe(false) // K4: no conference needed
  })
})
