import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isRecaptchaConfigured, verifyRecaptcha } from "@/lib/recaptcha";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const ORIGINAL_SECRET = process.env.RECAPTCHA_SECRET_KEY;

function setSecret(value: string | undefined) {
  if (value === undefined) delete process.env.RECAPTCHA_SECRET_KEY;
  else process.env.RECAPTCHA_SECRET_KEY = value;
}

describe("recaptcha", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    setSecret(ORIGINAL_SECRET);
  });

  describe("isRecaptchaConfigured", () => {
    it("false sem secret key", () => {
      setSecret(undefined);
      expect(isRecaptchaConfigured()).toBe(false);
    });

    it("true com secret key", () => {
      setSecret("test-secret");
      expect(isRecaptchaConfigured()).toBe(true);
    });
  });

  describe("verifyRecaptcha", () => {
    it("fail-open: sem secret configurada, permite sem chamar o Google", async () => {
      setSecret(undefined);
      const ok = await verifyRecaptcha("qualquer-token");
      expect(ok).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("token vazio com secret configurada → falha (sem chamar o Google)", async () => {
      setSecret("test-secret");
      const ok = await verifyRecaptcha("");
      expect(ok).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("token válido segundo o Google → true", async () => {
      setSecret("test-secret");
      mockFetch.mockResolvedValueOnce({ json: async () => ({ success: true }) });
      const ok = await verifyRecaptcha("token-bom", "1.2.3.4");
      expect(ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toContain("siteverify");
      expect((init.body as URLSearchParams).get("secret")).toBe("test-secret");
      expect((init.body as URLSearchParams).get("response")).toBe("token-bom");
      expect((init.body as URLSearchParams).get("remoteip")).toBe("1.2.3.4");
    });

    it("token recusado pelo Google → false", async () => {
      setSecret("test-secret");
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
      });
      expect(await verifyRecaptcha("token-ruim")).toBe(false);
    });

    it("fail-open: erro de rede com o Google → permite (não derruba o login)", async () => {
      setSecret("test-secret");
      mockFetch.mockRejectedValueOnce(new Error("network down"));
      expect(await verifyRecaptcha("token")).toBe(true);
    });

    it("não envia remoteip quando o IP é 'unknown'", async () => {
      setSecret("test-secret");
      mockFetch.mockResolvedValueOnce({ json: async () => ({ success: true }) });
      await verifyRecaptcha("token", "unknown");
      const [, init] = mockFetch.mock.calls[0]!;
      expect((init.body as URLSearchParams).has("remoteip")).toBe(false);
    });
  });
});
