import { describe, it, expect } from "vitest"
import { addMonthsSafe } from "@/lib/date/add-months-safe"

// Datas construídas em horário LOCAL (new Date(ano, mêsIndex, dia)) para o teste
// não depender de fuso — getDate/getMonth leem em local time.
describe("addMonthsSafe", () => {
  it("adiciona meses preservando o dia quando cabe", () => {
    const r = addMonthsSafe(new Date(2026, 5, 15), 2)
    expect(r.getMonth()).toBe(7) // agosto
    expect(r.getDate()).toBe(15)
  })

  it("não transborda: 31/jan + 1 mês = 28/fev (não 03/mar)", () => {
    const r = addMonthsSafe(new Date(2026, 0, 31), 1)
    expect(r.getMonth()).toBe(1) // fevereiro
    expect(r.getDate()).toBe(28)
  })

  it("ano bissexto: 31/jan + 1 mês = 29/fev", () => {
    const r = addMonthsSafe(new Date(2028, 0, 31), 1) // 2028 é bissexto
    expect(r.getMonth()).toBe(1)
    expect(r.getDate()).toBe(29)
  })

  it("cruza o ano", () => {
    const r = addMonthsSafe(new Date(2026, 10, 30), 2)
    expect(r.getFullYear()).toBe(2027)
    expect(r.getMonth()).toBe(0) // janeiro
    expect(r.getDate()).toBe(30)
  })

  it("0 meses = mesma data", () => {
    const r = addMonthsSafe(new Date(2026, 5, 15), 0)
    expect(r.getMonth()).toBe(5)
    expect(r.getDate()).toBe(15)
  })
})
