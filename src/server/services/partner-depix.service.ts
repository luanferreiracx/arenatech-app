/**
 * API de parceiros — DePix read-only (ADR 0057, Fase 2). Fornece DTOs ESTÁVEIS e
 * versionados (v1) sobre os dados DePix do tenant, sem vazar tipos Prisma. Cada
 * função roda em `withTenant(tenantId, …)` (RLS aplicado — isolamento garantido).
 */
import { Prisma, DepixTransactionStatus } from "@prisma/client";
import { withTenant } from "@/server/db";
import * as lwk from "@/lib/services/lwk-service";
import type {
  PartnerBalanceDTO,
  PartnerTransactionDTO,
  PartnerTransactionListDTO,
} from "@/lib/partner-api/openapi-schemas";

export type { PartnerBalanceDTO, PartnerTransactionDTO, PartnerTransactionListDTO };

const VALID_STATUSES = new Set<string>(Object.values(DepixTransactionStatus));

// DTOs são definidos em openapi-schemas.ts (fonte única req/resp + OpenAPI).

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

// ── Funções ─────────────────────────────────────────────────────────────────

export async function getPartnerBalance(tenantId: string): Promise<PartnerBalanceDTO> {
  // Só consulta o LWK se a carteira está provisionada (evita auto-criar carteira
  // fantasma — mesma guarda do getOverview interno).
  const wallet = await withTenant(tenantId, async (db) =>
    db.tenantDepixWallet.findUnique({
      where: { tenantId },
      select: { provisionedAt: true },
    }),
  );
  const provisioned = !!wallet?.provisionedAt;
  if (!provisioned) return { depix: 0, provisioned: false };

  const balance = await lwk.getBalance(tenantId);
  return { depix: balance.success ? (balance.depixBalance ?? 0) : 0, provisioned: true };
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

export interface ListPartnerTxParams {
  page?: number; // 0-based
  pageSize?: number; // <= 100
  kind?: "DEPOSIT" | "WITHDRAW";
  status?: string;
}

export async function listPartnerTransactions(
  tenantId: string,
  params: ListPartnerTxParams,
): Promise<PartnerTransactionListDTO> {
  const page = Math.max(0, params.page ?? 0);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const where: Prisma.TenantDepixTransactionWhereInput = { tenantId };
  if (params.kind) where.kind = params.kind;
  // status filtra só se for um valor válido do enum (ignora lixo silenciosamente).
  if (params.status && VALID_STATUSES.has(params.status)) {
    where.status = params.status as DepixTransactionStatus;
  }

  const [rows, total] = await withTenant(tenantId, async (db) =>
    Promise.all([
      db.tenantDepixTransaction.findMany({
        where,
        select: TX_SELECT,
        orderBy: { createdAt: "desc" },
        skip: page * pageSize,
        take: pageSize,
      }),
      db.tenantDepixTransaction.count({ where }),
    ]),
  );

  return {
    data: (rows as TxRow[]).map(toDTO),
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}
