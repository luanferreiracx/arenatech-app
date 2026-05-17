import { describe, it, expect } from "vitest"
import { generateInstallments } from "@/server/services/installment-generator.service"

describe("Installment Generator (dízima handling)", () => {
  it("single installment = full amount", () => {
    const result = generateInstallments(100, 1, new Date("2026-06-30"))
    expect(result).toHaveLength(1)
    expect(result[0]!.amount).toBe(100)
    expect(result[0]!.number).toBe(1)
  })

  it("3 parcelas de R$ 100 = 33.33 + 33.33 + 33.34", () => {
    const result = generateInstallments(100, 3, new Date("2026-06-30"))
    expect(result).toHaveLength(3)
    expect(result[0]!.amount).toBe(33.33)
    expect(result[1]!.amount).toBe(33.33)
    expect(result[2]!.amount).toBe(33.34) // last absorbs remainder
    // Sum must equal total
    const sum = result.reduce((s, p) => s + p.amount, 0)
    expect(Math.round(sum * 100) / 100).toBe(100)
  })

  it("2 parcelas de R$ 99.99 = 50.00 + 49.99", () => {
    const result = generateInstallments(99.99, 2, new Date("2026-07-01"))
    expect(result[0]!.amount).toBe(50)
    expect(result[1]!.amount).toBe(49.99)
    const sum = result.reduce((s, p) => s + p.amount, 0)
    expect(Math.round(sum * 100) / 100).toBe(99.99)
  })

  it("exact division (R$ 600 / 3 = R$ 200 each)", () => {
    const result = generateInstallments(600, 3, new Date("2026-06-01"))
    expect(result[0]!.amount).toBe(200)
    expect(result[1]!.amount).toBe(200)
    expect(result[2]!.amount).toBe(200)
  })

  it("due dates are monthly increments", () => {
    const result = generateInstallments(300, 3, new Date("2026-06-15"))
    expect(result[0]!.dueDate.getMonth()).toBe(5) // June (0-indexed)
    expect(result[1]!.dueDate.getMonth()).toBe(6) // July
    expect(result[2]!.dueDate.getMonth()).toBe(7) // August
  })

  it("installment numbers are sequential 1..N", () => {
    const result = generateInstallments(500, 5, new Date("2026-01-01"))
    expect(result.map((p) => p.number)).toEqual([1, 2, 3, 4, 5])
  })

  it("36 parcelas: sum equals total", () => {
    const result = generateInstallments(1000, 36, new Date("2026-01-01"))
    expect(result).toHaveLength(36)
    const sum = result.reduce((s, p) => s + p.amount, 0)
    expect(Math.round(sum * 100) / 100).toBe(1000)
  })

  it("throws on 0 installments", () => {
    expect(() => generateInstallments(100, 0, new Date())).toThrow()
  })

  it("throws on negative amount", () => {
    expect(() => generateInstallments(-100, 3, new Date())).toThrow()
  })

  it("small amount: R$ 0.10 / 3 = 0.03 + 0.03 + 0.04", () => {
    const result = generateInstallments(0.10, 3, new Date("2026-01-01"))
    const sum = result.reduce((s, p) => s + p.amount, 0)
    expect(Math.round(sum * 100) / 100).toBe(0.10)
  })
})
