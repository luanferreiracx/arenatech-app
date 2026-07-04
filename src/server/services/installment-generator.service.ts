import { addMonthsSafe } from "@/lib/date/add-months-safe"

/**
 * Divisão de um total em N parcelas, em CENTAVOS inteiros (sem float).
 *
 * Todas as parcelas têm o mesmo valor (floor da divisão); a ÚLTIMA absorve o
 * resto, então a soma bate exatamente com o total. Vencimentos mensais via
 * addMonthsSafe (trata 31/jan → 28/fev; o setMonth nativo transbordava).
 *
 * Fonte ÚNICA da geração de parcelas: o preview das telas de criar conta e a
 * persistência em financial.create usam esta função — antes o router fazia o
 * split inline (floor/centavos) e o preview usava uma cópia em reais com round,
 * então o que o usuário via podia diferir do que era gravado.
 */
export function generateInstallments(
  totalCents: number,
  numInstallments: number,
  firstDueDate: Date,
): Array<{ number: number; amountCents: number; dueDate: Date }> {
  if (numInstallments < 1) throw new Error("Mínimo 1 parcela")
  if (totalCents <= 0) throw new Error("Valor total deve ser positivo")

  const baseCents = Math.floor(totalCents / numInstallments)
  const lastCents = totalCents - baseCents * (numInstallments - 1)

  const result: Array<{ number: number; amountCents: number; dueDate: Date }> = []
  for (let i = 1; i <= numInstallments; i++) {
    result.push({
      number: i,
      amountCents: i === numInstallments ? lastCents : baseCents,
      dueDate: addMonthsSafe(firstDueDate, i - 1),
    })
  }
  return result
}
