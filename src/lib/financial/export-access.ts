/**
 * RBAC do export financeiro (rota REST `/api/financial/export`).
 *
 * Regra (F8, ADR 0032): operador só enxerga RECEIVABLE; contas a PAGAR (custos
 * de fornecedor) são exclusivas de admin. Este helper é a fonte única da decisão
 * e espelha o gate do router tRPC — a rota REST antes o contornava (G-P0-3).
 */
export type FinancialTxType = "PAYABLE" | "RECEIVABLE";

/**
 * Tipo de transação efetivo para o filtro do export.
 * - operador: sempre `RECEIVABLE` (ignora qualquer `txType` pedido).
 * - admin: o `txType` pedido, se válido; `null` = ambos (PAYABLE + RECEIVABLE).
 */
export function resolveExportTxType(
  isAdmin: boolean,
  requestedTxType: string | null | undefined,
): FinancialTxType | null {
  if (!isAdmin) return "RECEIVABLE";
  if (requestedTxType === "PAYABLE" || requestedTxType === "RECEIVABLE") {
    return requestedTxType;
  }
  return null;
}
