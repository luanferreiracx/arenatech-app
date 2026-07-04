import { describe, it, expect } from "vitest"
import { signedDepositCents } from "@/server/services/cash-session.service"

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
