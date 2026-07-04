import { describe, it, expect } from "vitest"
import {
  computeCashDrawerCents,
  signedDepositCents,
} from "@/server/services/cash-session.service"

/**
 * Regressão: manualAdjustment grava type=DEPOSIT com nature variável. O
 * fechamento (buildSummary) somava todo DEPOSIT como positivo, então um ajuste
 * OUTCOME (dinheiro retirado da gaveta) era contado como ENTRADA — erro de 2× o
 * valor na conferência de caixa. signedDepositCents é a fonte única do sinal.
 */
describe("signedDepositCents", () => {
  it("depósito comum (INCOME) contribui positivo", () => {
    expect(signedDepositCents(20000, "INCOME")).toBe(20000)
  })

  it("ajuste OUTCOME (retirada) contribui negativo", () => {
    expect(signedDepositCents(20000, "OUTCOME")).toBe(-20000)
  })

  it("uma retirada de R$200 muda o caixa esperado em -R$200 (não +R$200)", () => {
    // Antes do fix: DEPOSIT somava +20000 → swing de R$400 na conferência.
    const antesDoFixSempreePositivo = 20000
    expect(signedDepositCents(20000, "OUTCOME")).not.toBe(antesDoFixSempreePositivo)
    expect(signedDepositCents(20000, "OUTCOME")).toBe(-20000)
  })

  it("zero permanece zero em qualquer nature", () => {
    expect(signedDepositCents(0, "INCOME")).toBe(0)
    expect(signedDepositCents(0, "OUTCOME")).toBe(-0)
  })
})

/**
 * Fonte única da conferência de caixa. Antes o fechamento manual (buildSummary)
 * e o forçado/automático (calculateSessionBalance) usavam fórmulas diferentes —
 * o mesmo caixa dava saldos distintos. E despesas não-dinheiro (cartão/PIX)
 * reduziam indevidamente o dinheiro da gaveta.
 */
describe("computeCashDrawerCents", () => {
  it("abertura sem movimentos = saldo inicial", () => {
    expect(computeCashDrawerCents(10000, [])).toBe(10000)
  })

  it("venda em dinheiro entra na gaveta", () => {
    const r = computeCashDrawerCents(10000, [
      { nature: "INCOME", amountCents: 5000, paymentMethod: "dinheiro" },
    ])
    expect(r).toBe(15000)
  })

  it("venda no cartão/PIX NÃO entra na gaveta", () => {
    const r = computeCashDrawerCents(10000, [
      { nature: "INCOME", amountCents: 5000, paymentMethod: "cartao_credito" },
      { nature: "INCOME", amountCents: 3000, paymentMethod: "pix" },
      { nature: "INCOME", amountCents: 2000, paymentMethod: "depix" },
    ])
    expect(r).toBe(10000)
  })

  it("despesa paga no CARTÃO não reduz o dinheiro da gaveta (o bug)", () => {
    const r = computeCashDrawerCents(10000, [
      { nature: "OUTCOME", amountCents: 4000, paymentMethod: "cartao_credito" },
    ])
    expect(r).toBe(10000) // antes: 6000 (errado)
  })

  it("despesa em dinheiro reduz a gaveta", () => {
    const r = computeCashDrawerCents(10000, [
      { nature: "OUTCOME", amountCents: 4000, paymentMethod: "dinheiro" },
    ])
    expect(r).toBe(6000)
  })

  it("sangria (WITHDRAWAL dinheiro) reduz; suprimento (DEPOSIT dinheiro) soma", () => {
    const r = computeCashDrawerCents(10000, [
      { nature: "OUTCOME", amountCents: 3000, paymentMethod: "dinheiro" }, // sangria
      { nature: "INCOME", amountCents: 5000, paymentMethod: "dinheiro" }, // suprimento
    ])
    expect(r).toBe(12000)
  })

  it("ajuste manual OUTCOME reduz a gaveta (gerente retirou)", () => {
    const r = computeCashDrawerCents(10000, [
      { nature: "OUTCOME", amountCents: 2000, paymentMethod: "ajuste_manual" },
    ])
    expect(r).toBe(8000)
  })

  it("movimento de abertura (paymentMethod null) não é somado de novo", () => {
    // openingCents já contém a abertura; o movimento espelho não deve duplicar.
    const r = computeCashDrawerCents(10000, [
      { nature: "INCOME", amountCents: 10000, paymentMethod: null },
    ])
    expect(r).toBe(10000)
  })

  it("cenário misto: só dinheiro e ajuste contam", () => {
    const r = computeCashDrawerCents(10000, [
      { nature: "INCOME", amountCents: 5000, paymentMethod: "dinheiro" }, // +5000
      { nature: "INCOME", amountCents: 9000, paymentMethod: "cartao_credito" }, // ignora
      { nature: "OUTCOME", amountCents: 2000, paymentMethod: "dinheiro" }, // -2000
      { nature: "OUTCOME", amountCents: 1500, paymentMethod: "pix" }, // ignora
      { nature: "OUTCOME", amountCents: 1000, paymentMethod: "ajuste_manual" }, // -1000
    ])
    expect(r).toBe(12000) // 10000 + 5000 - 2000 - 1000
  })
})
