import { describe, it, expect } from "vitest"
import { isDiscountAllowed, discountPercentOf } from "@/lib/sales/discount-cap"

/**
 * Teto de desconto do PDV: admin irrestrito; operador limitado ao % do tenant.
 * Fonte única usada por applyDiscount e updateItemPrice.
 */
describe("isDiscountAllowed", () => {
  it("admin é sempre permitido (mesmo acima do teto)", () => {
    expect(isDiscountAllowed({ requestedPercent: 90, isAdmin: true, maxPercentNonAdmin: 10 })).toBe(true)
  })

  it("sem teto configurado (null) → qualquer desconto passa", () => {
    expect(isDiscountAllowed({ requestedPercent: 50, isAdmin: false, maxPercentNonAdmin: null })).toBe(true)
    expect(isDiscountAllowed({ requestedPercent: 50, isAdmin: false, maxPercentNonAdmin: undefined })).toBe(true)
  })

  it("operador dentro do teto passa", () => {
    expect(isDiscountAllowed({ requestedPercent: 5, isAdmin: false, maxPercentNonAdmin: 10 })).toBe(true)
  })

  it("operador exatamente no teto passa (borda)", () => {
    expect(isDiscountAllowed({ requestedPercent: 10, isAdmin: false, maxPercentNonAdmin: 10 })).toBe(true)
  })

  it("operador acima do teto é bloqueado", () => {
    expect(isDiscountAllowed({ requestedPercent: 10.5, isAdmin: false, maxPercentNonAdmin: 10 })).toBe(false)
    expect(isDiscountAllowed({ requestedPercent: 100, isAdmin: false, maxPercentNonAdmin: 10 })).toBe(false)
  })

  it("teto 0 = nenhum desconto para operador", () => {
    expect(isDiscountAllowed({ requestedPercent: 0, isAdmin: false, maxPercentNonAdmin: 0 })).toBe(true)
    expect(isDiscountAllowed({ requestedPercent: 1, isAdmin: false, maxPercentNonAdmin: 0 })).toBe(false)
  })

  it("tolera ruído de ponto flutuante logo no limite", () => {
    // 10.000001% derivado de centavos não deve barrar um teto de 10%.
    expect(isDiscountAllowed({ requestedPercent: 10.000001, isAdmin: false, maxPercentNonAdmin: 10 })).toBe(true)
  })
})

describe("discountPercentOf", () => {
  it("converte valor absoluto em % da base", () => {
    expect(discountPercentOf(1000, 10000)).toBe(10) // R$10 de R$100 = 10%
    expect(discountPercentOf(2500, 5000)).toBe(50)
  })

  it("base zero → 0% (evita divisão por zero)", () => {
    expect(discountPercentOf(1000, 0)).toBe(0)
  })

  it("desconto zero → 0%", () => {
    expect(discountPercentOf(0, 10000)).toBe(0)
  })
})
