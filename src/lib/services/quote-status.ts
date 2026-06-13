/**
 * Regras puras de restauracao de status apos aprovar/rejeitar uma revisao de
 * orcamento de OS. Mantido fora do router (sem dependencias server-only) para
 * ser testavel isoladamente.
 *
 * Contexto do bug OS202600260: quando uma revisao de orcamento comeca enquanto a
 * OS JA esta em WAITING_APPROVAL (revisoes encadeadas), o serviceOrderHistory
 * grava WAITING_APPROVAL -> WAITING_APPROVAL. Para descobrir o status REAL de
 * origem (ex.: COMPLETED), a busca precisa IGNORAR esses registros — senao a
 * "restauracao" devolve WAITING_APPROVAL e prende a OS num loop.
 */

export const WAITING_APPROVAL = "WAITING_APPROVAL" as const;

/**
 * Filtro Prisma para encontrar o ultimo status REAL de origem antes da cadeia de
 * revisoes: ultimo history que ENTROU em WAITING_APPROVAL vindo de outro status.
 */
export function lastRealOriginWhere(orderId: string) {
  return {
    orderId,
    newStatus: WAITING_APPROVAL,
    previousStatus: { not: WAITING_APPROVAL },
  };
}

/**
 * Status final apos processar a revisao, dado o status real de origem.
 * Fallback: APPROVED na aprovacao, IN_DIAGNOSIS na rejeicao (paridade com a
 * logica antiga do respondToQuote).
 */
export function statusAfterQuote(
  realOriginStatus: string | null,
  action: "approve" | "reject",
): string {
  if (realOriginStatus && realOriginStatus !== WAITING_APPROVAL) {
    return realOriginStatus;
  }
  return action === "approve" ? "APPROVED" : "IN_DIAGNOSIS";
}
