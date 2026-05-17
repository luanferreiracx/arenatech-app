/**
 * Proportional division with rounding correction (dízima).
 * All but last installment have identical amount.
 * Last installment absorbs any rounding remainder.
 * Sum always equals totalAmount exactly.
 *
 * Source: legacy FinanceiroService.gerarParcelasReceber()
 */
export function generateInstallments(
  totalAmount: number,
  numInstallments: number,
  firstDueDate: Date
): Array<{ number: number; amount: number; dueDate: Date }> {
  if (numInstallments < 1) throw new Error("Mínimo 1 parcela")
  if (totalAmount <= 0) throw new Error("Valor total deve ser positivo")

  const installmentAmount = Math.round((totalAmount / numInstallments) * 100) / 100
  const lastAmount = Math.round((totalAmount - installmentAmount * (numInstallments - 1)) * 100) / 100

  const result: Array<{ number: number; amount: number; dueDate: Date }> = []

  for (let i = 1; i <= numInstallments; i++) {
    const dueDate = new Date(firstDueDate)
    dueDate.setMonth(dueDate.getMonth() + (i - 1))

    result.push({
      number: i,
      amount: i === numInstallments ? lastAmount : installmentAmount,
      dueDate,
    })
  }

  return result
}
