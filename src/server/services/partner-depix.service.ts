/**
 * API de parceiros — status de transação DePix (ADR 0057). A API se limita a
 * depósito + saque; a única leitura é o STATUS de UMA transação que o parceiro
 * criou. Roda em `withTenant(tenantId, …)` (RLS — isolamento garantido) e devolve
 * um DTO estável (sem vazar tipos Prisma).
 */
import { withTenant } from "@/server/db";
import type { PartnerTransactionDTO } from "@/lib/partner-api/openapi-schemas";

export type { PartnerTransactionDTO };

// Shape mínimo lido do banco (só o que o DTO precisa).
interface TxRow {
  id: string;
  number: string;
  kind: "DEPOSIT" | "WITHDRAW";
  status: string;
  sourceType: string;
  grossAmountCents: number;
  netAmountCents: number | null;
  feeArenaTechCents: number;
  payerName: string | null;
  recipientName: string | null;
  depositTxId: string | null;
  withdrawTxId: string | null;
  onchainAddress: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

const TX_SELECT = {
  id: true,
  number: true,
  kind: true,
  status: true,
  sourceType: true,
  grossAmountCents: true,
  netAmountCents: true,
  feeArenaTechCents: true,
  payerName: true,
  recipientName: true,
  depositTxId: true,
  withdrawTxId: true,
  onchainAddress: true,
  createdAt: true,
  completedAt: true,
} as const;

function toDTO(t: TxRow): PartnerTransactionDTO {
  return {
    id: t.id,
    number: t.number,
    kind: t.kind,
    status: t.status,
    sourceType: t.sourceType,
    grossAmountCents: t.grossAmountCents,
    netAmountCents: t.netAmountCents,
    feeArenaTechCents: t.feeArenaTechCents,
    payerName: t.payerName,
    recipientName: t.recipientName,
    onchainTxId: t.kind === "DEPOSIT" ? t.depositTxId : t.withdrawTxId,
    onchainAddress: t.onchainAddress,
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
  };
}

export async function getPartnerTransaction(
  tenantId: string,
  id: string,
): Promise<PartnerTransactionDTO | null> {
  const row = await withTenant(tenantId, async (db) =>
    db.tenantDepixTransaction.findUnique({ where: { id }, select: TX_SELECT }),
  );
  if (row) return toDTO(row as TxRow);

  // O `id` pode ser um PEDIDO de saque aguardando autorização do titular
  // (carteira non-custodial — a Arena não tem a chave para assinar sozinha).
  // O parceiro recebeu esse id no POST e precisa de UM lugar para consultar o
  // desfecho; mandá-lo adivinhar qual endpoint usar seria transferir para ele
  // uma complexidade que é nossa.
  return getAuthorizationAsTransaction(tenantId, id);
}

/**
 * Projeta um pedido de autorização no mesmo formato de transação.
 *
 * Depois de autorizado, o pedido aponta o saque de verdade e passamos a
 * responder AQUELE — assim o parceiro que consulta pelo id do pedido acompanha
 * o saque até o fim sem precisar trocar de identificador no meio do caminho.
 */
async function getAuthorizationAsTransaction(
  tenantId: string,
  id: string,
): Promise<PartnerTransactionDTO | null> {
  const authorization = await withTenant(tenantId, async (db) =>
    db.depixWithdrawAuthorization.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        netAmountCents: true,
        recipientName: true,
        transactionId: true,
        createdAt: true,
        resolvedAt: true,
      },
    }),
  );
  if (!authorization) return null;

  if (authorization.transactionId) {
    const row = await withTenant(tenantId, async (db) =>
      db.tenantDepixTransaction.findUnique({
        where: { id: authorization.transactionId! },
        select: TX_SELECT,
      }),
    );
    if (row) return toDTO(row as TxRow);
  }

  return {
    id: authorization.id,
    number: null,
    kind: "WITHDRAW",
    status:
      authorization.status === "PENDING" ? "AWAITING_AUTHORIZATION" : authorization.status,
    sourceType: "WALLET",
    grossAmountCents: authorization.netAmountCents,
    netAmountCents: authorization.netAmountCents,
    feeArenaTechCents: 0,
    payerName: null,
    recipientName: authorization.recipientName,
    onchainTxId: null,
    onchainAddress: null,
    createdAt: authorization.createdAt.toISOString(),
    completedAt: authorization.resolvedAt ? authorization.resolvedAt.toISOString() : null,
  };
}
