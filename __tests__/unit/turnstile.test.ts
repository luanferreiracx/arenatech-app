import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isTurnstileConfigured, verifyTurnstile } from "@/lib/turnstile";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET_KEY;

function setSecret(value: string | undefined) {
  if (value === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = value;
}

describe("turnstile", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    setSecret(ORIGINAL_SECRET);
  });

  describe("isTurnstileConfigured", () => {
    it("false sem secret key", () => {
      setSecret(undefined);
      expect(isTurnstileConfigured()).toBe(false);
    });

    it("true com secret key", () => {
      setSecret("test-secret");
      expect(isTurnstileConfigured()).toBe(true);
    });
  });

  describe("verifyTurnstile", () => {
    it("fail-open: sem secret configurada, permite sem chamar o Cloudflare", async () => {
      setSecret(undefined);
      const ok = await verifyTurnstile("qualquer-token");
      expect(ok).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("token vazio com secret configurada → falha (sem chamar o Cloudflare)", async () => {
      setSecret("test-secret");
      const ok = await verifyTurnstile("");
      expect(ok).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("token válido segundo o Cloudflare → true; envia secret/response/remoteip", async () => {
      setSecret("test-secret");
      mockFetch.mockResolvedValueOnce({ json: async () => ({ success: true }) });
      const ok = await verifyTurnstile("token-bom", "1.2.3.4");
      expect(ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toContain("challenges.cloudflare.com/turnstile/v0/siteverify");
      expect((init.body as URLSearchParams).get("secret")).toBe("test-secret");
      expect((init.body as URLSearchParams).get("response")).toBe("token-bom");
      expect((init.body as URLSearchParams).get("remoteip")).toBe("1.2.3.4");
    });

    it("token recusado pelo Cloudflare → false", async () => {
      setSecret("test-secret");
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
      });
      expect(await verifyTurnstile("token-ruim")).toBe(false);
    });

    it("fail-open: erro de rede com o Cloudflare → permite (não derruba o login)", async () => {
      setSecret("test-secret");
      mockFetch.mockRejectedValueOnce(new Error("network down"));
      expect(await verifyTurnstile("token")).toBe(true);
    });

    it("não envia remoteip quando o IP é 'unknown'", async () => {
      setSecret("test-secret");
      mockFetch.mockResolvedValueOnce({ json: async () => ({ success: true }) });
      await verifyTurnstile("token", "unknown");
      const [, init] = mockFetch.mock.calls[0]!;
      expect((init.body as URLSearchParams).has("remoteip")).toBe(false);
    });
  });
});
