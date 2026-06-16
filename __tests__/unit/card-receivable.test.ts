import { describe, it, expect } from "vitest"
import {
  computeCardSettlement,
  addCalendarDays,
  splitCardReceivable,
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

describe("splitCardReceivable", () => {
  const saleDate = new Date("2026-06-16T10:00:00.000Z")
  const rate = { feePercent: 3, feeFixed: 0, settlementDays: 30 }

  it("1x: um único recebível com o total", () => {
    const r = splitCardReceivable(rate, 10000, 1, saleDate)
    expect(r).toHaveLength(1)
    expect(r[0]!.installmentNumber).toBe(1)
    expect(r[0]!.grossCents).toBe(10000)
    expect(r[0]!.feeCents).toBe(300)
    expect(r[0]!.netCents).toBe(9700)
    expect(r[0]!.settlementDate.toISOString().slice(0, 10)).toBe("2026-07-16")
  })

  it("3x de R$ 100: soma de bruto fecha (33.33+33.33+33.34)", () => {
    const r = splitCardReceivable(rate, 10000, 3, saleDate)
    expect(r).toHaveLength(3)
    const sumGross = r.reduce((s, x) => s + x.grossCents, 0)
    expect(sumGross).toBe(10000)
    expect(r[0]!.grossCents).toBe(3333)
    expect(r[1]!.grossCents).toBe(3333)
    expect(r[2]!.grossCents).toBe(3334) // última absorve o resto
  })

  it("3x: cada parcela liquida mês a mês (D+30, D+60, D+90)", () => {
    const r = splitCardReceivable(rate, 30000, 3, saleDate)
    expect(r[0]!.settlementDate.toISOString().slice(0, 10)).toBe("2026-07-16")
    expect(r[1]!.settlementDate.toISOString().slice(0, 10)).toBe("2026-08-15")
    expect(r[2]!.settlementDate.toISOString().slice(0, 10)).toBe("2026-09-14")
  })

  it("soma de líquido + soma de taxa = bruto total", () => {
    const r = splitCardReceivable({ feePercent: 2.99, feeFixed: 50, settlementDays: 1 }, 9999, 4, saleDate)
    const sumNet = r.reduce((s, x) => s + x.netCents, 0)
    const sumFee = r.reduce((s, x) => s + x.feeCents, 0)
    const sumGross = r.reduce((s, x) => s + x.grossCents, 0)
    expect(sumGross).toBe(9999)
    expect(sumNet + sumFee).toBe(9999)
  })

  it("installments < 1 vira 1", () => {
    const r = splitCardReceivable(rate, 5000, 0, saleDate)
    expect(r).toHaveLength(1)
    expect(r[0]!.grossCents).toBe(5000)
  })

  it("total negativo lança", () => {
    expect(() => splitCardReceivable(rate, -1, 2, saleDate)).toThrow()
  })
})
