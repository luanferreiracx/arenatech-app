import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDepixWithdraw,
  getDepixWithdrawStatus,
} from "@/lib/services/depix-service";

const originalEnv = process.env;

describe("Eulen DePix withdraw service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env = {
      ...originalEnv,
      DEPIX_API_KEY: "eulen_jwt",
      DEPIX_SAQUE_URL: "https://depix.eulen.test/api/withdraw",
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it("cria saque no formato Eulen (pixKey/taxNumber/payoutAmountInCents, sem senha)", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        withdrawalId: "w_123abc",
        depositAddress: "lq1qq-address",
        depositAmountInCents: 5_050,
        payoutAmountInCents: 5_000,
      }),
    } as Response);

    const result = await createDepixWithdraw(
      "teste@example.com",
      "EMAIL",
      50,
      "52998224725",
    );

    expect(result.success).toBe(true);
    // Eulen retorna `withdrawalId` -> mapeado pra `id`.
    expect(result.id).toBe("w_123abc");
    expect(result.depositAddress).toBe("lq1qq-address");
    expect(result.depositAmountInCents).toBe(5_050);
    expect(result.payoutAmountInCents).toBe(5_000);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://depix.eulen.test/api/withdraw",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer eulen_jwt",
        }),
        body: JSON.stringify({
          pixKey: "teste@example.com",
          taxNumber: "52998224725",
          payoutAmountInCents: 5_000,
        }),
      }),
    );
  });

  it("propaga errorMessage da Eulen como erro", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errorMessage: "invalid pix key" }),
    } as Response);

    const result = await createDepixWithdraw("x@y.com", "EMAIL", 50, "52998224725");
    expect(result.success).toBe(false);
    expect(result.error).toContain("invalid pix key");
  });

  it("consulta status do saque na Eulen (GET ?id=, sem senha)", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "w_123abc", status: "sent" }),
    } as Response);

    const result = await getDepixWithdrawStatus("w_123abc");

    expect(result).toEqual({
      success: true,
      status: "sent",
      raw: { id: "w_123abc", status: "sent" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://depix.eulen.test/api/withdraw-status?id=w_123abc",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json" },
      }),
    );
  });
});
