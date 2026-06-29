/**
 * partner-depix.service (ADR 0057, Fase 2): DTOs versionados read-only. Garante
 * que o DTO NÃO vaza campos internos do Prisma, o saldo respeita a guarda de
 * provisão, e a paginação faz clamp. Banco/LWK mockados.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const walletFindUnique = vi.fn();
const txFindUnique = vi.fn();
const txFindMany = vi.fn();
const txCount = vi.fn();
const getBalance = vi.fn();

const db = {
  tenantDepixWallet: { findUnique: walletFindUnique },
  tenantDepixTransaction: { findUnique: txFindUnique, findMany: txFindMany, count: txCount },
};

vi.mock("@/server/db", () => ({
  withTenant: (_t: string, fn: (d: typeof db) => unknown) => fn(db),
}));
vi.mock("@/lib/services/lwk-service", () => ({
  getBalance: (...a: unknown[]) => getBalance(...a),
}));

import {
  getPartnerBalance,
  getPartnerTransaction,
  listPartnerTransactions,
} from "@/server/services/partner-depix.service";

const TENANT = "11111111-1111-1111-1111-111111111111";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "tx-1",
    number: "TXD-1",
    kind: "DEPOSIT",
    status: "COMPLETED",
    sourceType: "WALLET",
    grossAmountCents: 10000,
    netAmountCents: 9751,
    feeArenaTechCents: 249,
    payerName: "Paulo",
    recipientName: null,
    depositTxId: "onchain-abc",
    withdrawTxId: null,
    onchainAddress: null,
    createdAt: new Date("2026-06-29T10:00:00Z"),
    completedAt: new Date("2026-06-29T10:05:00Z"),
    // Campos internos que NAO devem aparecer no DTO:
    pixKey: "segredo",
    apiResponse: { sensitive: true },
    idempotencyKey: "k",
    ...over,
  };
}

beforeEach(() => {
  for (const m of [walletFindUnique, txFindUnique, txFindMany, txCount, getBalance]) m.mockReset();
});

describe("partner-depix.service", () => {
  it("balance: carteira nao provisionada -> 0 sem chamar LWK", async () => {
    walletFindUnique.mockResolvedValue({ provisionedAt: null });
    const b = await getPartnerBalance(TENANT);
    expect(b).toEqual({ depix: 0, provisioned: false });
    expect(getBalance).not.toHaveBeenCalled();
  });

  it("balance: provisionada -> le do LWK", async () => {
    walletFindUnique.mockResolvedValue({ provisionedAt: new Date() });
    getBalance.mockResolvedValue({ success: true, depixBalance: 42.5 });
    const b = await getPartnerBalance(TENANT);
    expect(b).toEqual({ depix: 42.5, provisioned: true });
  });

  it("transaction: DTO estavel, sem vazar campos internos do Prisma", async () => {
    txFindUnique.mockResolvedValue(row());
    const dto = await getPartnerTransaction(TENANT, "tx-1");
    expect(dto).not.toBeNull();
    // Campos do contrato.
    expect(dto).toMatchObject({
      id: "tx-1",
      number: "TXD-1",
      kind: "DEPOSIT",
      status: "COMPLETED",
      onchainTxId: "onchain-abc", // depositTxId no DEPOSIT
      payerName: "Paulo",
      createdAt: "2026-06-29T10:00:00.000Z",
      completedAt: "2026-06-29T10:05:00.000Z",
    });
    // NUNCA expor internos.
    const raw = dto as unknown as Record<string, unknown>;
    expect(raw).not.toHaveProperty("pixKey");
    expect(raw).not.toHaveProperty("apiResponse");
    expect(raw).not.toHaveProperty("idempotencyKey");
    expect(raw).not.toHaveProperty("depositTxId");
  });

  it("transaction: saque usa withdrawTxId como onchainTxId", async () => {
    txFindUnique.mockResolvedValue(row({ kind: "WITHDRAW", depositTxId: null, withdrawTxId: "wtx-9" }));
    const dto = await getPartnerTransaction(TENANT, "tx-1");
    expect(dto!.onchainTxId).toBe("wtx-9");
  });

  it("transaction: inexistente -> null", async () => {
    txFindUnique.mockResolvedValue(null);
    expect(await getPartnerTransaction(TENANT, "nope")).toBeNull();
  });

  it("list: pagina/clampa pageSize e mapeia DTOs", async () => {
    txFindMany.mockResolvedValue([row(), row({ id: "tx-2", number: "TXD-2" })]);
    txCount.mockResolvedValue(2);
    const res = await listPartnerTransactions(TENANT, { page: 0, pageSize: 999 });
    // pageSize clampa em 100.
    const args = txFindMany.mock.calls[0]![0] as { take: number; skip: number };
    expect(args.take).toBe(100);
    expect(res.data).toHaveLength(2);
    expect(res.total).toBe(2);
    expect(res.pageCount).toBe(1);
    expect(res.data[0]).not.toHaveProperty("apiResponse");
  });

  it("list: ignora status invalido (nao filtra por lixo)", async () => {
    txFindMany.mockResolvedValue([]);
    txCount.mockResolvedValue(0);
    await listPartnerTransactions(TENANT, { status: "LIXO" });
    const where = (txFindMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where).not.toHaveProperty("status");
  });
});
