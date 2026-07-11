/**
 * handleEulenWithdrawWebhook: sent->COMPLETED (+onWithdrawCompleted),
 * error/refunded->FAILED, sending->PROCESSING, idempotencia, terminal->skip.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const recordWebhookEvent = vi.fn();
const markWebhookProcessed = vi.fn();
const onWithdrawCompleted = vi.fn();

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: unknown) => unknown) =>
    fn({ tenantDepixTransaction: { findFirst, update, updateMany } }),
}));
vi.mock("@/lib/webhooks/replay-guard", () => ({
  recordWebhookEvent: (...a: unknown[]) => recordWebhookEvent(...a),
  markWebhookProcessed: (...a: unknown[]) => markWebhookProcessed(...a),
}));
vi.mock("@/server/services/depix-transaction.service", () => ({
  onWithdrawCompleted: (...a: unknown[]) => onWithdrawCompleted(...a),
}));
vi.mock("@/lib/depix/receipt-url", () => ({
  extractDepixWithdrawReceiptUrl: () => null,
}));

import { handleEulenWithdrawWebhook } from "@/lib/webhooks/eulen-withdraw-handler";

const TENANT = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  for (const m of [findFirst, update, updateMany, recordWebhookEvent, markWebhookProcessed, onWithdrawCompleted]) m.mockReset();
  recordWebhookEvent.mockResolvedValue(true); // evento novo
  update.mockResolvedValue({});
  updateMany.mockResolvedValue({ count: 1 });
  markWebhookProcessed.mockResolvedValue(undefined);
});

describe("handleEulenWithdrawWebhook", () => {
  it("status sent -> COMPLETED + onWithdrawCompleted", async () => {
    findFirst.mockResolvedValue({ id: "tx-1", status: "PROCESSING", tenantId: TENANT });
    const res = await handleEulenWithdrawWebhook(
      { webhookType: "withdraw", id: "w_1", status: "sent", receiptUrl: "https://r" },
      null,
    );
    expect(res.status).toBe(200);
    const data = update.mock.calls[0]![0] as { data: { status: string } };
    expect(data.data.status).toBe("COMPLETED");
    expect(onWithdrawCompleted).toHaveBeenCalledWith(TENANT, "tx-1");
  });

  it("status error -> FAILED (sem onWithdrawCompleted)", async () => {
    findFirst.mockResolvedValue({ id: "tx-2", status: "PROCESSING", tenantId: TENANT });
    await handleEulenWithdrawWebhook({ webhookType: "withdraw", id: "w_2", status: "error" }, null);
    const data = update.mock.calls[0]![0] as { data: { status: string } };
    expect(data.data.status).toBe("FAILED");
    expect(onWithdrawCompleted).not.toHaveBeenCalled();
  });

  it("persiste o nome oficial do destinatario (receiverName) da Eulen", async () => {
    findFirst.mockResolvedValue({ id: "tx-r", status: "PROCESSING", tenantId: TENANT });
    await handleEulenWithdrawWebhook(
      { webhookType: "withdraw", id: "w_r", status: "sent", receiverName: "  Ana Lima  " },
      null,
    );
    const data = update.mock.calls[0]![0] as { data: { recipientName?: string } };
    expect(data.data.recipientName).toBe("Ana Lima"); // trim
  });

  it("sem receiverName -> NAO escreve recipientName (nao apaga o nome digitado)", async () => {
    findFirst.mockResolvedValue({ id: "tx-n", status: "PROCESSING", tenantId: TENANT });
    await handleEulenWithdrawWebhook({ webhookType: "withdraw", id: "w_n", status: "sent" }, null);
    const data = update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect("recipientName" in data.data).toBe(false);
  });

  it("receiverName da Eulen PREVALECE sobre o nome digitado pelo operador", async () => {
    // tx ja tem um nome (o operador digitou); a Eulen valida outro oficial.
    findFirst.mockResolvedValue({ id: "tx-p", status: "PROCESSING", tenantId: TENANT });
    await handleEulenWithdrawWebhook(
      { webhookType: "withdraw", id: "w_p", status: "sent", receiverName: "JOAO DA SILVA OFICIAL" },
      null,
    );
    const data = update.mock.calls[0]![0] as { data: { recipientName?: string } };
    expect(data.data.recipientName).toBe("JOAO DA SILVA OFICIAL");
  });

  it("status sending -> PROCESSING (nao terminal)", async () => {
    findFirst.mockResolvedValue({ id: "tx-3", status: "PROCESSING", tenantId: TENANT });
    await handleEulenWithdrawWebhook({ webhookType: "withdraw", id: "w_3", status: "sending" }, null);
    const data = update.mock.calls[0]![0] as { data: { status: string; completedAt?: unknown } };
    expect(data.data.status).toBe("PROCESSING");
    expect(data.data.completedAt).toBeUndefined();
  });

  it("evento duplicado -> 200 sem update", async () => {
    recordWebhookEvent.mockResolvedValue(false);
    const res = await handleEulenWithdrawWebhook({ webhookType: "withdraw", id: "w_1", status: "sent" }, null);
    expect(res.body).toMatchObject({ duplicate: true });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("tx ja terminal -> skip (nao reabre)", async () => {
    findFirst.mockResolvedValue({ id: "tx-4", status: "COMPLETED", tenantId: TENANT });
    const res = await handleEulenWithdrawWebhook({ webhookType: "withdraw", id: "w_4", status: "sent" }, null);
    expect(res.body).toMatchObject({ skipped: "already_terminal" });
    expect(update).not.toHaveBeenCalled();
  });

  it("status nao mapeado -> 200 skipped", async () => {
    const res = await handleEulenWithdrawWebhook({ webhookType: "withdraw", id: "w_5", status: "weird" }, null);
    expect(res.body).toMatchObject({ skipped: expect.stringContaining("weird") });
  });
});
