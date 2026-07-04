import { describe, it, expect } from "vitest"
import { generateInstallments } from "@/server/services/installment-generator.service"

/**
 * Geração de parcelas em CENTAVOS inteiros (floor + resto na última). Fonte
 * única do preview das telas e da persistência em financial.create — antes o
 * router usava floor/centavos e o preview uma cópia em reais com round, então o
 * que o usuário via podia diferir do gravado.
 */
describe("generateInstallments (centavos)", () => {
  it("1 parcela = total cheio", () => {
    const r = generateInstallments(10000, 1, new Date("2026-06-30"))
    expect(r).toHaveLength(1)
    expect(r[0]!.amountCents).toBe(10000)
    expect(r[0]!.number).toBe(1)
  })

  it("R$100 em 3 = 3333 + 3333 + 3334 (última absorve o resto)", () => {
    const r = generateInstallments(10000, 3, new Date("2026-06-30"))
    expect(r.map((p) => p.amountCents)).toEqual([3333, 3333, 3334])
    expect(r.reduce((s, p) => s + p.amountCents, 0)).toBe(10000)
  })

  it("R$99,99 em 2 = 4999 + 5000 (floor, não round)", () => {
    // floor(9999/2)=4999; última = 9999 - 4999 = 5000. (A versão antiga com
    // round dava 5000 + 4999 — split diferente para o MESMO input.)
    const r = generateInstallments(9999, 2, new Date("2026-07-01"))
    expect(r.map((p) => p.amountCents)).toEqual([4999, 5000])
    expect(r.reduce((s, p) => s + p.amountCents, 0)).toBe(9999)
  })

  it("divisão exata: R$600 em 3 = 20000 cada", () => {
    const r = generateInstallments(60000, 3, new Date("2026-06-01"))
    expect(r.map((p) => p.amountCents)).toEqual([20000, 20000, 20000])
  })

  it("vencimentos são incrementos mensais", () => {
    const r = generateInstallments(30000, 3, new Date("2026-06-15"))
    expect(r[0]!.dueDate.getMonth()).toBe(5) // junho
    expect(r[1]!.dueDate.getMonth()).toBe(6) // julho
    expect(r[2]!.dueDate.getMonth()).toBe(7) // agosto
  })

  it("vencimento não transborda no fim do mês (31/jan +1 = 28/fev)", () => {
    // Data local para o teste não depender de fuso.
    const r = generateInstallments(20000, 2, new Date(2026, 0, 31))
    expect(r[1]!.dueDate.getMonth()).toBe(1) // fevereiro, não março
    expect(r[1]!.dueDate.getDate()).toBe(28)
  })

  it("números sequenciais 1..N", () => {
    const r = generateInstallments(50000, 5, new Date("2026-01-01"))
    expect(r.map((p) => p.number)).toEqual([1, 2, 3, 4, 5])
  })

  it("36 parcelas: soma bate com o total", () => {
    const r = generateInstallments(100000, 36, new Date("2026-01-01"))
    expect(r).toHaveLength(36)
    expect(r.reduce((s, p) => s + p.amountCents, 0)).toBe(100000)
  })

  it("valor pequeno: 10 centavos em 3 = 3 + 3 + 4", () => {
    const r = generateInstallments(10, 3, new Date("2026-01-01"))
    expect(r.map((p) => p.amountCents)).toEqual([3, 3, 4])
    expect(r.reduce((s, p) => s + p.amountCents, 0)).toBe(10)
  })

  it("lança em 0 parcelas", () => {
    expect(() => generateInstallments(10000, 0, new Date())).toThrow()
  })

  it("lança em total não positivo", () => {
    expect(() => generateInstallments(-10000, 3, new Date())).toThrow()
    expect(() => generateInstallments(0, 3, new Date())).toThrow()
  })
})
