/**
 * Idempotência do finalize de venda (R5 da auditoria PDV — 2026-06-17).
 *
 * Em rede lenta o operador pode reenviar o mesmo finalize: a 1ª chamada já
 * marcou a venda COMPLETED, a 2ª batia num erro feio ("não está em rascunho")
 * e fazia o operador achar que falhou — risco de refazer a venda. Estas
 * funções decidem se um finalize que chegou numa venda já COMPLETED é o MESMO
 * request (duplo-submit → devolver a venda existente) ou um request DIFERENTE
 * (erro real).
 *
 * A "assinatura" é o conjunto de pagamentos (forma + valor + parcelas) somado
 * à forma de devolução (downgrade). É exatamente o que a venda finalizada
 * grava em `paymentDetails` + `refundDueMethod`, então os dois lados são
 * comparáveis. Funções puras, em centavos, testáveis sem banco.
 */

import { TRPCError } from "@trpc/server";

export interface FinalizePayment {
  method: string;
  /** Valor da mercadoria desta forma de pagamento, em centavos. */
  amount: number;
  installments?: number | null;
}

/**
 * Assinatura canônica de um conjunto de pagamentos + forma de devolução.
 * Independente de ordem (ordena antes de juntar) e de campos extras do JSON.
 */
export function buildPaymentSignature(
  payments: FinalizePayment[],
  refundDueMethod?: string | null,
): string {
  const paymentsPart = payments
    .map((p) => `${p.method}:${p.amount}:${p.installments ?? 1}`)
    .sort()
    .join("|");
  return `${refundDueMethod ?? ""}#${paymentsPart}`;
}

/**
 * Extrai pagamentos do `paymentDetails` (JSON da venda), descartando entradas
 * malformadas. Aceita `unknown` porque vem de `Prisma.JsonValue`.
 */
function parsePaymentDetails(value: unknown): FinalizePayment[] {
  if (!Array.isArray(value)) return [];
  const payments: FinalizePayment[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.method !== "string" || typeof record.amount !== "number") {
      continue;
    }
    payments.push({
      method: record.method,
      amount: record.amount,
      installments:
        typeof record.installments === "number" ? record.installments : 1,
    });
  }
  return payments;
}

export interface RecordedFinalizedSale {
  /** `Sale.paymentDetails` (Prisma.JsonValue). */
  paymentDetails: unknown;
  /** `Sale.refundDueMethod`. */
  refundDueMethod: string | null;
}

export interface IncomingFinalizeRequest {
  payments: FinalizePayment[];
  refundDueMethod?: string | null;
}

/**
 * `true` quando o finalize recebido é equivalente ao que já finalizou a venda
 * (mesmos pagamentos e forma de devolução) — ou seja, um duplo-submit seguro
 * de tratar como idempotente.
 */
export function isSameFinalizeRequest(
  recorded: RecordedFinalizedSale,
  incoming: IncomingFinalizeRequest,
): boolean {
  const recordedSignature = buildPaymentSignature(
    parsePaymentDetails(recorded.paymentDetails),
    recorded.refundDueMethod,
  );
  const incomingSignature = buildPaymentSignature(
    incoming.payments,
    incoming.refundDueMethod ?? null,
  );
  return recordedSignature === incomingSignature;
}

/** Subconjunto do client Prisma que o claim precisa (testável sem banco). */
export interface SaleClaimTx {
  sale: {
    updateMany: (args: {
      where: { id: string; status: "DRAFT" };
      data: { status: "COMPLETED" };
    }) => Promise<{ count: number }>;
  };
}

/**
 * Claim atômico do rascunho antes de finalizar (compare-and-set DRAFT→COMPLETED).
 *
 * Fecha a janela de duplo-finalize concorrente: o botão manual e o auto-finalize
 * (SSE/polling) podem disparar em paralelo e, sob READ COMMITTED, ambos leem
 * DRAFT. Sem este claim, vendas com estoque folgado ou de pagamento de OS (que
 * não têm o CAS de estoque como rede) gravariam caixa/recebível/comissão em
 * dobro. O perdedor da corrida vê `count !== 1` e aborta antes de qualquer write
 * de dinheiro. Espelha o CAS de status que `refund` já usa.
 *
 * Deve rodar dentro da transação do finalize; o update terminal preenche número
 * e demais campos calculados sobre a mesma linha já marcada COMPLETED.
 *
 * @throws {TRPCError} CONFLICT quando a venda não estava mais em DRAFT.
 */
export async function claimDraftSaleForFinalize(
  tx: SaleClaimTx,
  saleId: string,
): Promise<void> {
  const claim = await tx.sale.updateMany({
    where: { id: saleId, status: "DRAFT" },
    data: { status: "COMPLETED" },
  });
  if (claim.count !== 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Esta venda já está sendo finalizada.",
    });
  }
}
