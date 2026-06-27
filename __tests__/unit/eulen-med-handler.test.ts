/**
 * handleEulenMedWebhook: deposito devolvido pelo BC (MED) apos pago. Marca
 * MED_REFUNDED (pendencia) + alerta. NAO debita saldo (DePix on-chain; estorno
 * manual). Idempotente; deposito desconhecido -> alerta + 200.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const updateMany = vi.fn();
const recordWebhookEvent = vi.fn();
const markWebhookProcessed = vi.fn();

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: unknown) => unknown) =>
    fn({ tenantDepixTransaction: { findFirst, updateMany } }),
}));
vi.mock("@/lib/webhooks/replay-guard", () => ({
  recordWebhookEvent: (...a: unknown[]) => recordWebhookEvent(...a),
  markWebhookProcessed: (...a: unknown[]) => markWebhookProcessed(...a),
}));

import { handleEulenMedWebhook } from "@/lib/webhooks/eulen-med-handler";

const TENANT = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  for (const m of [findFirst, updateMany, recordWebhookEvent, markWebhookProcessed]) m.mockReset();
  recordWebhookEvent.mockResolvedValue(true);
  updateMany.mockResolvedValue({ count: 1 });
  markWebhookProcessed.mockResolvedValue(undefined);
  findFirst.mockResolvedValue({
    id: "tx-1",
    tenantId: TENANT,
    status: "COMPLETED",
    number: "TXD-1",
    netAmountCents: 9000,
  });
});

describe("handleEulenMedWebhook", () => {
  it("MED de deposito conhecido -> MED_REFUNDED (sem debitar saldo)", async () => {
    const res = await handleEulenMedWebhook(
      { webhookType: "med", qrId: "q1", principalValueInCents: 9000, taxNumber: "529", name: "Fulano" },
      null,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matched: true, status: "MED_REFUNDED" });
    const data = updateMany.mock.calls[0]![0] as { data: { status: string; medReportedAt: unknown } };
    expect(data.data.status).toBe("MED_REFUNDED");
    expect(data.data.medReportedAt).toBeInstanceOf(Date);
  });

  it("evento duplicado -> 200 sem buscar tx", async () => {
    recordWebhookEvent.mockResolvedValue(false);
    const res = await handleEulenMedWebhook({ webhookType: "med", qrId: "q1" }, null);
    expect(res.body).toMatchObject({ duplicate: true });
    expect(findFirst).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("deposito desconhecido -> 200 matched:false (sem update)", async () => {
    findFirst.mockResolvedValue(null);
    const res = await handleEulenMedWebhook(
      { webhookType: "med", qrId: "q-x", principalValueInCents: 100 },
      null,
    );
    expect(res.body).toMatchObject({ matched: false });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("sem qrId -> 400", async () => {
    const res = await handleEulenMedWebhook({ webhookType: "med" }, null);
    expect(res.status).toBe(400);
    expect(recordWebhookEvent).not.toHaveBeenCalled();
  });
});
