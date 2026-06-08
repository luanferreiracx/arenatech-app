import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrionPixPayment,
  extractOrionTransactionId,
  getOrionPixStatus,
  normalizeOrionWebhookStatus,
  verifyOrionWebhookSignature,
} from "@/lib/services/orion-pay-service";

const originalEnv = process.env;

describe("Orion Pay deposit service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env = {
      ...originalEnv,
      ORION_PAY_API_KEY: "orion_key",
      ORION_PAY_API_BASE_URL: "https://orion.test",
      ORION_PAY_PIX_ENDPOINT: "/api/v1/pix/personal",
      ORION_PAY_WEBHOOK_SECRET: "webhook_secret",
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it("creates personal PIX with Orion payload", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        qrCode: "pix-copy-paste",
        qrCodeImage: "data:image/png;base64,abc",
        transactionId: "orion-tx-123",
        eulenDepositId: "orion-eulen-123",
        amount: 450,
        status: "PENDING",
      }),
    } as Response);

    const result = await createOrionPixPayment(
      450,
      "Deposito DePix 1",
      "local-ref-1",
      "05000000096",
      { payerPhone: "86999991234" },
    );

    expect(result.success).toBe(true);
    expect(result.transactionId).toBe("orion-tx-123");
    expect(result.qrCode).toBe("pix-copy-paste");
    expect(result.qrCodeBase64).toBe("data:image/png;base64,abc");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://orion.test/api/v1/pix/personal",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-API-Key": "orion_key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          name: "Cliente Arena Tech",
          email: "pagador@arenatechpi.com.br",
          amount: 450,
          description: "Deposito DePix 1",
          cpf: "05000000096",
          phone: "86999991234",
        }),
      }),
    );
  });

  it("queries and normalizes paid status", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ status: "PAID", paid: true, amount: 450 }),
    } as Response);

    const result = await getOrionPixStatus("orion-tx-123");

    expect(result).toEqual({ success: true, status: "paid", isFinal: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://orion.test/api/v1/pix/status/orion-tx-123",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("verifies Orion webhook signature and extracts ids", () => {
    const body = JSON.stringify({ data: { transactionId: "orion-tx-123", status: "PAID" } });
    const signature = `sha256=${createHmac("sha256", "webhook_secret").update(body).digest("hex")}`;

    expect(verifyOrionWebhookSignature(body, signature, "payment.success", "delivery-1")).toEqual({
      success: true,
      event: "payment.success",
      delivery: "delivery-1",
    });
    expect(extractOrionTransactionId(JSON.parse(body))).toBe("orion-tx-123");
    expect(normalizeOrionWebhookStatus("payment.success", JSON.parse(body))).toBe("paid");
  });
});
