/**
 * partner-depix.service (ADR 0057): status de UMA transação (o depósito/saque que o
 * parceiro criou). Garante que o DTO NÃO vaza campos internos do Prisma. Banco mockado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const txFindUnique = vi.fn();

const db = {
  tenantDepixTransaction: { findUnique: txFindUnique },
};

vi.mock("@/server/db", () => ({
  withTenant: (_t: string, fn: (d: typeof db) => unknown) => fn(db),
}));

import { getPartnerTransaction } from "@/server/services/partner-depix.service";

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

beforeEach(() => txFindUnique.mockReset());

describe("getPartnerTransaction", () => {
  it("DTO estavel, sem vazar campos internos do Prisma", async () => {
    txFindUnique.mockResolvedValue(row());
    const dto = await getPartnerTransaction(TENANT, "tx-1");
    expect(dto).not.toBeNull();
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
    const raw = dto as unknown as Record<string, unknown>;
    expect(raw).not.toHaveProperty("pixKey");
    expect(raw).not.toHaveProperty("apiResponse");
    expect(raw).not.toHaveProperty("idempotencyKey");
    expect(raw).not.toHaveProperty("depositTxId");
  });

  it("saque usa withdrawTxId como onchainTxId", async () => {
    txFindUnique.mockResolvedValue(row({ kind: "WITHDRAW", depositTxId: null, withdrawTxId: "wtx-9" }));
    const dto = await getPartnerTransaction(TENANT, "tx-1");
    expect(dto!.onchainTxId).toBe("wtx-9");
  });

  it("inexistente -> null", async () => {
    txFindUnique.mockResolvedValue(null);
    expect(await getPartnerTransaction(TENANT, "nope")).toBeNull();
  });
});
