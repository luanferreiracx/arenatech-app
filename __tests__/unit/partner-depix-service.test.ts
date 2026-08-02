/**
 * partner-depix.service (ADR 0057): status de UMA transação (o depósito/saque que o
 * parceiro criou). Garante que o DTO NÃO vaza campos internos do Prisma. Banco mockado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const txFindUnique = vi.fn();
const authFindFirst = vi.fn();

const db = {
  tenantDepixTransaction: { findUnique: txFindUnique },
  // Um id que não é transação pode ser um PEDIDO de saque aguardando o titular
  // (carteira non-custodial). O parceiro consulta pelo mesmo endpoint.
  depixWithdrawAuthorization: { findFirst: authFindFirst },
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
    authFindFirst.mockResolvedValue(null);
    expect(await getPartnerTransaction(TENANT, "nope")).toBeNull();
  });

  it("id de um PEDIDO aguardando o titular responde pelo mesmo endpoint", async () => {
    // O parceiro recebe esse id no POST do saque. Mandá-lo adivinhar qual
    // endpoint consultar seria transferir para ele uma complexidade nossa.
    txFindUnique.mockResolvedValue(null);
    authFindFirst.mockResolvedValue({
      id: "auth-1",
      status: "PENDING",
      netAmountCents: 5000,
      recipientName: "Fulano",
      transactionId: null,
      createdAt: new Date("2026-08-02T12:00:00Z"),
      resolvedAt: null,
    });

    const dto = await getPartnerTransaction(TENANT, "auth-1");

    expect(dto?.status).toBe("AWAITING_AUTHORIZATION");
    expect(dto?.kind).toBe("WITHDRAW");
    // Ainda não existe saque, logo não existe número.
    expect(dto?.number).toBeNull();
  });

  it("pedido já autorizado responde o SAQUE, sem trocar de identificador", async () => {
    // Depois de autorizado, quem consulta pelo id do pedido precisa acompanhar
    // o saque até o fim — não receber um registro parado num estado final falso.
    txFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "tx-9",
      number: "TXW-9",
      kind: "WITHDRAW",
      status: "PROCESSING",
      sourceType: "WALLET",
      grossAmountCents: 5100,
      netAmountCents: 5000,
      feeArenaTechCents: 100,
      payerName: null,
      recipientName: "Fulano",
      depositTxId: null,
      withdrawTxId: null,
      onchainAddress: null,
      createdAt: new Date("2026-08-02T12:00:00Z"),
      completedAt: null,
    });
    authFindFirst.mockResolvedValue({
      id: "auth-1",
      status: "AUTHORIZED",
      netAmountCents: 5000,
      recipientName: "Fulano",
      transactionId: "tx-9",
      createdAt: new Date("2026-08-02T12:00:00Z"),
      resolvedAt: new Date("2026-08-02T12:05:00Z"),
    });

    const dto = await getPartnerTransaction(TENANT, "auth-1");

    expect(dto?.number).toBe("TXW-9");
    expect(dto?.status).toBe("PROCESSING");
  });
});
