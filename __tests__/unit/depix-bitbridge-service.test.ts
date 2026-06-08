import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDepixWithdraw,
  getDepixWithdrawStatus,
} from "@/lib/services/depix-service";

const originalEnv = process.env;

describe("LiquidX Pro DePix withdraw service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env = {
      ...originalEnv,
      LIQUIDX_API_KEY: "liquidx_code",
      LIQUIDX_WITHDRAW_URL: "https://liquidx.test/api/withdraw",
      LIQUIDX_WITHDRAW_STATUS_URL: "https://liquidx.test/api/withdraw/status",
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it("creates withdraw with LiquidX payload", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        data: {
          id: "liquidx-withdraw-123",
          pixKey: "teste@example.com",
          depositAddress: "lq1qq-address",
          depositAmountInCents: 5_050,
          payoutAmountInCents: 5_000,
          status: "pending",
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
    expect(result.id).toBe("liquidx-withdraw-123");
    expect(result.depositAddress).toBe("lq1qq-address");
    expect(result.depositAmountInCents).toBe(5_050);
    expect(result.payoutAmountInCents).toBe(5_000);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://liquidx.test/api/withdraw",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        body: JSON.stringify({
          code: "liquidx_code",
          pixKey: "teste@example.com",
          payoutAmountInCents: 5_000,
        }),
      }),
    );
  });

  it("queries withdraw status with LiquidX", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        data: {
          id: "liquidx-withdraw-123",
          status: "completed",
        },
      }),
    } as Response);

    const result = await getDepixWithdrawStatus("liquidx-withdraw-123");

    expect(result).toEqual({
      success: true,
      status: "completed",
      raw: {
        id: "liquidx-withdraw-123",
        status: "completed",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://liquidx.test/api/withdraw/status?id=liquidx-withdraw-123",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json" },
      }),
    );
  });
});
