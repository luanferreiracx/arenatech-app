import { describe, it, expect } from "vitest"
import {
  computeCardSettlement,
  addCalendarDays,
} from "@/server/services/card-receivable.service"

describe("computeCardSettlement", () => {
  const saleDate = new Date("2026-06-16T10:00:00.000Z")

  it("taxa percentual: 2.99% de R$ 100 = R$ 2.99 -> líquido R$ 97.01", () => {
    const r = computeCardSettlement(
      { feePercent: 2.99, feeFixed: 0, settlementDays: 30 },
      10000,
      saleDate,
    )
    expect(r.grossCents).toBe(10000)
    expect(r.feeCents).toBe(299)
    expect(r.netCents).toBe(9701)
  })

  it("taxa fixa soma à percentual", () => {
    const r = computeCardSettlement(
      { feePercent: 1, feeFixed: 50, settlementDays: 1 },
      10000,
      saleDate,
    )
    // 1% de 10000 = 100, + 50 fixo = 150
    expect(r.feeCents).toBe(150)
    expect(r.netCents).toBe(9850)
  })

  it("arredonda centavos (banker-safe round): 2.99% de R$ 33.33", () => {
    const r = computeCardSettlement(
      { feePercent: 2.99, feeFixed: 0, settlementDays: 0 },
      3333,
      saleDate,
    )
    // 3333 * 2.99 / 100 = 99.6567 -> 100
    expect(r.feeCents).toBe(100)
    expect(r.netCents).toBe(3233)
  })

  it("taxa nunca excede o bruto (clamp)", () => {
    const r = computeCardSettlement(
      { feePercent: 200, feeFixed: 0, settlementDays: 0 },
      5000,
      saleDate,
    )
    expect(r.feeCents).toBe(5000)
    expect(r.netCents).toBe(0)
  })

  it("bruto zero -> tudo zero", () => {
    const r = computeCardSettlement(
      { feePercent: 2.99, feeFixed: 100, settlementDays: 30 },
      0,
      saleDate,
    )
    expect(r.feeCents).toBe(0)
    expect(r.netCents).toBe(0)
  })

  it("data de liquidação = D+N corridos", () => {
    const r = computeCardSettlement(
      { feePercent: 0, feeFixed: 0, settlementDays: 30 },
      10000,
      new Date("2026-06-16T10:00:00.000Z"),
    )
    expect(r.settlementDate.toISOString().slice(0, 10)).toBe("2026-07-16")
  })

  it("D+0 = mesma data", () => {
    const r = computeCardSettlement(
      { feePercent: 0, feeFixed: 0, settlementDays: 0 },
      10000,
      saleDate,
    )
    expect(r.settlementDate.toISOString()).toBe(saleDate.toISOString())
  })

  it("feeFixed negativo é ignorado (clamp em 0)", () => {
    const r = computeCardSettlement(
      { feePercent: 0, feeFixed: -500, settlementDays: 0 },
      10000,
      saleDate,
    )
    expect(r.feeCents).toBe(0)
    expect(r.netCents).toBe(10000)
  })

  it("bruto negativo lança erro", () => {
    expect(() =>
      computeCardSettlement({ feePercent: 1, feeFixed: 0, settlementDays: 0 }, -1, saleDate),
    ).toThrow()
  })
})

describe("addCalendarDays", () => {
  it("cruza fronteira de mês", () => {
    const d = addCalendarDays(new Date("2026-01-31T12:00:00.000Z"), 1)
    expect(d.toISOString().slice(0, 10)).toBe("2026-02-01")
  })

  it("não muta a data original", () => {
    const original = new Date("2026-06-16T00:00:00.000Z")
    addCalendarDays(original, 10)
    expect(original.toISOString().slice(0, 10)).toBe("2026-06-16")
  })
})
