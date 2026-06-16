/**
 * Regressao: match do label do deposito LWK.
 *
 * Bug (prod 06-11 a 06-13): depositos travavam em PENDING/PROCESSING e nunca
 * confirmavam. Causa: createDeposit gravava `deposit_label = addr.label` (label
 * TRANSFORMADO pelo servico LWK — UUID sem hifen truncado + sufixo aleatorio,
 * ex "575df241dd194bf6abbe9107c4b6b6_aae19cc7"), mas o webhook do monitor LWK
 * reporta o label como `payload.label.user` = o `user` original que passamos a
 * generateAddress (= created.id, UUID com hifen). Os dois formatos nunca batiam,
 * entao settleDepositConfirmed nao achava a transacao.
 *
 * Fix: gravar `deposit_label = created.id`. Este teste trava a invariante:
 * o handler LWK busca pelo `label.user`, e esse valor e o id da transacao —
 * NUNCA o `label.label` transformado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const settleDepositConfirmed = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();
const eventCreate = vi.fn();
const eventUpdateMany = vi.fn();

vi.mock("@/server/services/depix-transaction.service", () => ({
  settleDepositConfirmed: (...args: unknown[]) => settleDepositConfirmed(...args),
  settleDepositViaFeeWallet: vi.fn(),
}));

// Evita arrastar @/server/api/trpc (NextAuth/next/server) via o fee-wallet
// service. Sem carteira de taxas -> deposito segue o fluxo normal.
vi.mock("@/server/services/depix-fee-wallet.service", () => ({
  getFeeWalletTenantId: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: unknown) => unknown) =>
    fn({
      depixWebhookEvent: { create: eventCreate, updateMany: eventUpdateMany },
    }),
  withTenant: (_tenantId: string, fn: (tx: unknown) => unknown) =>
    fn({
      tenantDepixTransaction: { findFirst, update },
    }),
}));

vi.mock("@/lib/services/lwk-service", () => ({
  listTransactions: vi.fn(),
}));

import { handleLwkDepositWebhook } from "@/lib/webhooks/lwk-deposit-handler";

const TX_ID = "f3861951-f2e7-44e3-8e66-d358debe8d4c"; // == created.id (label.user)
const TRANSFORMED_LABEL = "f3861951f2e744e38e66d358debe8d_c1b79371"; // label.label (NAO usar)
const TENANT = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  eventCreate.mockResolvedValue(undefined); // evento novo (nao duplicado)
  eventUpdateMany.mockResolvedValue(undefined);
});

describe("LWK deposit webhook — match de label", () => {
  it("status=pending busca a transacao pelo label.user (= id), nao pelo label transformado", async () => {
    findFirst.mockResolvedValue({ id: TX_ID });
    update.mockResolvedValue(undefined);

    await handleLwkDepositWebhook(
      {
        event: "deposit_received",
        status: "pending",
        tenant_id: TENANT,
        txid: "onchain-txid-1",
        confirmations: 1,
        depix: { amount: 75 },
        label: { user: TX_ID, label: TRANSFORMED_LABEL, address: "lq1qq..." },
      },
      null,
      true,
    );

    expect(findFirst).toHaveBeenCalledTimes(1);
    const whereArg = findFirst.mock.calls[0]![0] as { where: { depositLabel: string } };
    // INVARIANTE: o handler casa pelo user (id), nunca pelo label transformado.
    expect(whereArg.where.depositLabel).toBe(TX_ID);
    expect(whereArg.where.depositLabel).not.toBe(TRANSFORMED_LABEL);
  });

  it("status=confirmed repassa o label.user (= id) como depositLabel ao settle", async () => {
    // Mock do cross-check on-chain: confirma o valor.
    const lwk = await import("@/lib/services/lwk-service");
    vi.mocked(lwk.listTransactions).mockResolvedValue({
      success: true,
      transactions: [
        {
          txid: "onchain-txid-2",
          confirmations: 5,
          balance: { depix: { is_depix: true, amount: 75, satoshis: 0 } },
        },
      ],
    } as never);
    settleDepositConfirmed.mockResolvedValue({ completed: true });

    await handleLwkDepositWebhook(
      {
        event: "deposit_received",
        status: "confirmed",
        tenant_id: TENANT,
        txid: "onchain-txid-2",
        confirmations: 5,
        depix: { amount: 75 },
        label: { user: TX_ID, label: TRANSFORMED_LABEL, address: "lq1qq..." },
      },
      null,
      true,
    );

    expect(settleDepositConfirmed).toHaveBeenCalledTimes(1);
    const arg = settleDepositConfirmed.mock.calls[0]![0] as { depositLabel: string };
    expect(arg.depositLabel).toBe(TX_ID);
    expect(arg.depositLabel).not.toBe(TRANSFORMED_LABEL);
  });
});
