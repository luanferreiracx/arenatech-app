import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDepixWithdraw,
  getDepixWithdrawStatus,
} from "@/lib/services/depix-service";

const originalEnv = process.env;

describe("PixPay DePix withdraw service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env = {
      ...originalEnv,
      DEPIX_API_KEY: "pixpay_token",
      DEPIX_SAQUE_SENHA: "pixpay_secret",
      DEPIX_SAQUE_URL: "https://api.pixpay.test/v1/withdraw",
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it("creates withdraw with PixPay payload", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: {
          id: "pixpay-withdraw-123",
          depositAddress: "lq1qq-address",
          depositAmountInCents: 5_050,
          payoutAmountInCents: 5_000,
          status: "unsent",
        },
      }),
    } as Response);

    const result = await createDepixWithdraw(
      "teste@example.com",
      "EMAIL",
      50,
      "52998224725",
    );

    expect(result.success).toBe(true);
    expect(result.id).toBe("pixpay-withdraw-123");
    expect(result.depositAddress).toBe("lq1qq-address");
    expect(result.depositAmountInCents).toBe(5_050);
    expect(result.payoutAmountInCents).toBe(5_000);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.pixpay.test/v1/withdraw",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer pixpay_token",
        }),
        body: JSON.stringify({
          senha: "pixpay_secret",
          valor: "50.00",
          pixKey: "teste@example.com",
          tipoChave: "EMAIL",
          tax_id: "52998224725",
        }),
      }),
    );
  });

  it("queries withdraw status with PixPay", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: {
          id: "pixpay-withdraw-123",
          status: "completed",
        },
      }),
    } as Response);

    const result = await getDepixWithdrawStatus("pixpay-withdraw-123");

    expect(result).toEqual({
      success: true,
      status: "completed",
      raw: {
        id: "pixpay-withdraw-123",
        status: "completed",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.pixpay.test/v1/withdraw-status?id=pixpay-withdraw-123&senha=pixpay_secret",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json" },
      }),
    );
  });
});
