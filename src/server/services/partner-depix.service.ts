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
  return row ? toDTO(row as TxRow) : null;
}
