import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDepixWithdraw,
  createPixPayment,
  getDepixWithdrawStatus,
  getPixStatus,
} from "@/lib/services/depix-service";

const originalEnv = process.env;
const NONCE = "11111111-1111-1111-1111-111111111111";

/** Resposta sincrona da Eulen: { response, async:false }. */
function syncBody(response: Record<string, unknown>) {
  return { response, async: false };
}

describe("Eulen DePix service — contrato oficial (docs.eulen.app)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env = {
      ...originalEnv,
      DEPIX_API_KEY: "eulen_jwt",
      DEPIX_API_URL: "https://depix.eulen.test/api/deposit",
      DEPIX_SAQUE_URL: "https://depix.eulen.test/api/withdraw",
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  // ── Withdraw ──────────────────────────────────────────────────────────────

  it("cria saque no formato Eulen (pixKey/taxNumber/payoutAmountInCents) com nonce + X-Async:false", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        syncBody({
          withdrawalId: "w_123abc",
          depositAddress: "lq1qq-address",
          depositAmountInCents: 5_050,
          payoutAmountInCents: 5_000,
        }),
    } as Response);

    const result = await createDepixWithdraw("teste@example.com", "EMAIL", 50, "52998224725", NONCE);

    expect(result.success).toBe(true);
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
          "X-Nonce": NONCE,
          "X-Async": "false",
        }),
        body: JSON.stringify({
          pixKey: "teste@example.com",
          taxNumber: "52998224725",
          payoutAmountInCents: 5_000,
        }),
      }),
    );
  });

  it("retenta com o MESMO nonce quando a Eulen responde async:true, ate virar sincrono", async () => {
    const fetchMock = vi.mocked(fetch);
    // 1a resposta: ainda na fila (async). 2a: sincrona com o resultado.
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ async: true }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          syncBody({
            withdrawalId: "w_async",
            depositAddress: "lq1qq-async",
            depositAmountInCents: 1_010,
            payoutAmountInCents: 1_000,
          }),
      } as Response);

    vi.useFakeTimers();
    const promise = createDepixWithdraw("x@y.com", "EMAIL", 10, "52998224725", NONCE);
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result.success).toBe(true);
    expect(result.id).toBe("w_async");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Ambas as chamadas usam o MESMO nonce (idempotente — nao duplica saque).
    const firstNonce = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    const secondNonce = (fetchMock.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(firstNonce["X-Nonce"]).toBe(NONCE);
    expect(secondNonce["X-Nonce"]).toBe(NONCE);
  });

  it("propaga errorMessage da Eulen como erro", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => syncBody({ errorMessage: "invalid pix key" }),
    } as Response);

    const result = await createDepixWithdraw("x@y.com", "EMAIL", 50, "52998224725", NONCE);
    expect(result.success).toBe(false);
    expect(result.error).toContain("invalid pix key");
  });

  it("rejeita resposta de saque sem withdrawalId/depositAddress", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => syncBody({ depositAmountInCents: 100 }),
    } as Response);

    const result = await createDepixWithdraw("x@y.com", "EMAIL", 1, "52998224725", NONCE);
    expect(result.success).toBe(false);
    expect(result.error).toContain("invalida");
  });

  it("consulta status do saque com Bearer + X-Nonce (GET ?id=)", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => syncBody({ id: "w_123abc", status: "sent" }),
    } as Response);

    const result = await getDepixWithdrawStatus("w_123abc");

    expect(result.success).toBe(true);
    expect(result.status).toBe("sent");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://depix.eulen.test/api/withdraw-status?id=w_123abc");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer eulen_jwt");
    expect(headers["X-Nonce"]).toBeDefined();
  });

  // ── Deposit ───────────────────────────────────────────────────────────────

  it("cria deposit com endUserTaxNumber + nonce, parseando response.{qrCopyPaste,qrImageUrl,id}", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        syncBody({ id: "dep_1", qrCopyPaste: "0002012...", qrImageUrl: "https://q/img.png" }),
    } as Response);

    const result = await createPixPayment(50, "desc", NONCE, "52998224725", {
      depixAddress: "lq1qq-dest",
    });

    expect(result.success).toBe(true);
    expect(result.transactionId).toBe("dep_1");
    expect(result.qrCode).toBe("0002012...");
    expect(result.qrCodeBase64).toBe("https://q/img.png");
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["X-Nonce"]).toBe(NONCE);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.endUserTaxNumber).toBe("52998224725");
    expect(body.amountInCents).toBe(5_000);
  });

  it("cria deposit SEM CPF — nao envia endUserTaxNumber (Eulen aceita)", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => syncBody({ id: "dep_2", qrCopyPaste: "0002...", qrImageUrl: "https://q.png" }),
    } as Response);

    const result = await createPixPayment(50, "desc", NONCE, null, { depixAddress: "lq1qq" });

    expect(result.success).toBe(true);
    expect(result.transactionId).toBe("dep_2");
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.endUserTaxNumber).toBeUndefined();
    expect(body.amountInCents).toBe(5_000);
  });

  it("status approved -> pix_received (NAO creditavel, nao final)", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => syncBody({ status: "approved" }),
    } as Response);

    const result = await getPixStatus("dep_1");
    expect(result.status).toBe("pix_received");
    expect(result.isFinal).toBe(false);
  });

  it("status depix_sent -> paid (creditavel, final)", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => syncBody({ status: "depix_sent" }),
    } as Response);

    const result = await getPixStatus("dep_1");
    expect(result.status).toBe("paid");
    expect(result.isFinal).toBe(true);
  });
});
