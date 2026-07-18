/**
 * applyPixReceivedEffects (marco "PIX recebido" = approved): libera a venda do
 * PDV/QuickSale na hora (QuickSale->PAID + pg_notify('depix_paid')), SEM creditar
 * saldo. Deposito wallet puro (sem sourceType) e no-op. Banco mockado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const txFindUnique = vi.fn();
const txUpdateMany = vi.fn();
const quickSaleFindFirst = vi.fn();
const quickSaleUpdate = vi.fn();
const saleFindUnique = vi.fn();
const executeRaw = vi.fn();

const tx = {
  tenantDepixTransaction: { findUnique: txFindUnique, updateMany: txUpdateMany },
  quickSale: { findFirst: quickSaleFindFirst, update: quickSaleUpdate },
  sale: { findUnique: saleFindUnique },
  $executeRaw: executeRaw,
};

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
  withTenant: (_t: string, fn: (t: typeof tx) => unknown) => fn(tx),
}));
vi.mock("@/server/api/trpc", () => ({ CENTRAL_TENANT_SLUG: "arena-tech" }));
vi.mock("@/lib/services/lwk-service", () => ({}));
vi.mock("@/lib/webhooks/verify-deposit-onchain", () => ({ verifyDepositOnChain: vi.fn() }));
vi.mock("@/server/services/depix-fee-wallet.service", () => ({
  getFeeWalletTenantId: vi.fn(),
  ensureFeeWalletLbtc: vi.fn(),
}));
// Webhook de saída pro parceiro (deposit.pix_received) — importado dinamicamente.
const notifyPartnerWebhook = vi.fn();
vi.mock("@/server/services/partner-webhook.service", () => ({
  notifyPartnerWebhook: (...a: unknown[]) => notifyPartnerWebhook(...a),
}));

import { applyPixReceivedEffects } from "@/server/services/depix-transaction.service";

const TENANT = "11111111-1111-1111-1111-111111111111";
const TX_ID = "33333333-3333-3333-3333-333333333333";
const SALE_ID = "44444444-4444-4444-4444-444444444444";

beforeEach(() => {
  for (const m of [
    txFindUnique, txUpdateMany, quickSaleFindFirst, quickSaleUpdate, saleFindUnique,
    executeRaw, notifyPartnerWebhook,
  ]) m.mockReset();
  executeRaw.mockResolvedValue(undefined);
  quickSaleUpdate.mockResolvedValue({});
  // Default: o CAS do webhook de parceiro PERDE (já notificado / sem config) -> não
  // dispara. Os testes de venda existentes não se importam com o webhook.
  txUpdateMany.mockResolvedValue({ count: 0 });
  notifyPartnerWebhook.mockResolvedValue(undefined);
});

describe("applyPixReceivedEffects", () => {
  it("QUICK_SALE -> marca PAID e notifica (sem creditar saldo)", async () => {
    txFindUnique.mockResolvedValue({
      id: TX_ID, tenantId: TENANT, sourceType: "QUICK_SALE", sourceId: SALE_ID, pixApprovedAt: new Date(),
      status: "PROCESSING",
    });
    quickSaleFindFirst.mockResolvedValue({ id: SALE_ID, number: 7 });

    const res = await applyPixReceivedEffects(TENANT, TX_ID);

    expect(res.applied).toBe(true);
    const data = quickSaleUpdate.mock.calls[0]![0] as { data: { status: string; depixStatus: string } };
    expect(data.data.status).toBe("PAID");
    expect(data.data.depixStatus).toBe("paid");
    expect(executeRaw).toHaveBeenCalledTimes(1); // pg_notify('depix_paid')
  });

  it("SALE -> notifica o SSE (operador finaliza)", async () => {
    txFindUnique.mockResolvedValue({
      id: TX_ID, tenantId: TENANT, sourceType: "SALE", sourceId: SALE_ID, pixApprovedAt: new Date(),
      status: "PROCESSING",
    });
    saleFindUnique.mockResolvedValue({ id: SALE_ID, number: 9 });

    const res = await applyPixReceivedEffects(TENANT, TX_ID);

    expect(res.applied).toBe(true);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(quickSaleUpdate).not.toHaveBeenCalled();
  });

  it("WH-3: status revertido (MED_REFUNDED) -> NAO libera a venda (guard de corrida MED)", async () => {
    // Corrida: entre a revalidacao e aqui, um webhook MED reverteu o deposito.
    txFindUnique.mockResolvedValue({
      id: TX_ID, tenantId: TENANT, sourceType: "QUICK_SALE", sourceId: SALE_ID, pixApprovedAt: new Date(),
      status: "MED_REFUNDED",
    });

    const res = await applyPixReceivedEffects(TENANT, TX_ID);

    expect(res.applied).toBe(false);
    expect(quickSaleUpdate).not.toHaveBeenCalled(); // venda NAO sai com deposito estornado
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("deposito wallet puro (sem sourceType) -> no-op", async () => {
    txFindUnique.mockResolvedValue({
      id: TX_ID, tenantId: TENANT, sourceType: "WALLET", sourceId: null, pixApprovedAt: new Date(),
    });

    const res = await applyPixReceivedEffects(TENANT, TX_ID);

    expect(res.applied).toBe(false);
    expect(quickSaleUpdate).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("QuickSale ja paga (nao AWAITING_PAYMENT) -> idempotente, nao re-notifica", async () => {
    txFindUnique.mockResolvedValue({
      id: TX_ID, tenantId: TENANT, sourceType: "QUICK_SALE", sourceId: SALE_ID, pixApprovedAt: new Date(),
    });
    quickSaleFindFirst.mockResolvedValue(null); // ja saiu de AWAITING_PAYMENT

    await applyPixReceivedEffects(TENANT, TX_ID);

    expect(quickSaleUpdate).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("PIX recebido: dispara deposit.pix_received pro parceiro (1a vez: CAS ganha)", async () => {
    // Deposito WALLET puro (sem venda) — o webhook de parceiro vale pra QUALQUER deposito.
    txFindUnique.mockResolvedValue({
      id: TX_ID, tenantId: TENANT, sourceType: "WALLET", sourceId: null, pixApprovedAt: new Date(),
      number: "TXD-1", status: "PROCESSING", netAmountCents: 9800, grossAmountCents: 10000,
    });
    txUpdateMany.mockResolvedValue({ count: 1 }); // CAS reivindica o disparo

    await applyPixReceivedEffects(TENANT, TX_ID);
    // O webhook é fire-and-forget (void) — dá um tick pra ele completar.
    await new Promise((r) => setTimeout(r, 0));

    // CAS foi tentado no marcador de idempotencia.
    expect(txUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: TX_ID, partnerPixReceivedNotifiedAt: null },
    });
    expect(notifyPartnerWebhook).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ type: "deposit.pix_received", transactionId: TX_ID, amountCents: 9800 }),
    );
  });

  it("PIX recebido reentrante (CAS perde): NAO redispara o webhook (once-only)", async () => {
    txFindUnique.mockResolvedValue({
      id: TX_ID, tenantId: TENANT, sourceType: "WALLET", sourceId: null, pixApprovedAt: new Date(),
    });
    txUpdateMany.mockResolvedValue({ count: 0 }); // ja notificado antes

    await applyPixReceivedEffects(TENANT, TX_ID);

    expect(notifyPartnerWebhook).not.toHaveBeenCalled();
  });

  it("SUBSCRIPTION: NAO dispara webhook de deposito pro parceiro", async () => {
    txFindUnique.mockResolvedValue({
      id: TX_ID, tenantId: TENANT, sourceType: "SUBSCRIPTION", sourceId: "sub-1", pixApprovedAt: new Date(),
    });
    txUpdateMany.mockResolvedValue({ count: 1 });

    await applyPixReceivedEffects(TENANT, TX_ID).catch(() => {});

    expect(notifyPartnerWebhook).not.toHaveBeenCalled();
  });
});
