import { describe, it, expect, beforeEach, vi } from "vitest";
import { rateLimit, refundRateLimit, clearRateLimitStore } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  it("allows requests within limit", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
      expect(result.success).toBe(true);
    }
  });

  it("returns decreasing remaining count", async () => {
    const r1 = await rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
    expect(r1.remaining).toBe(4);

    const r2 = await rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
    expect(r2.remaining).toBe(3);

    const r3 = await rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
    expect(r3.remaining).toBe(2);
  });

  it("blocks the 6th request when limit is 5", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
      expect(result.success).toBe(true);
    }

    const blocked = await rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets after window expires", async () => {
    vi.useFakeTimers();

    for (let i = 0; i < 5; i++) {
      await rateLimit({ key: "test", limit: 5, windowMs: 1_000 });
    }

    const blocked = await rateLimit({ key: "test", limit: 5, windowMs: 1_000 });
    expect(blocked.success).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(1_100);

    const afterReset = await rateLimit({ key: "test", limit: 5, windowMs: 1_000 });
    expect(afterReset.success).toBe(true);
    expect(afterReset.remaining).toBe(4);

    vi.useRealTimers();
  });

  it("tracks different keys independently", async () => {
    for (let i = 0; i < 5; i++) {
      await rateLimit({ key: "user-a", limit: 5, windowMs: 60_000 });
    }

    const blockedA = await rateLimit({ key: "user-a", limit: 5, windowMs: 60_000 });
    expect(blockedA.success).toBe(false);

    const allowedB = await rateLimit({ key: "user-b", limit: 5, windowMs: 60_000 });
    expect(allowedB.success).toBe(true);
  });

  it("returns a reset timestamp in the future", async () => {
    const before = Date.now();
    const result = await rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
    expect(result.reset).toBeGreaterThanOrEqual(before + 60_000);
  });

  describe("refundRateLimit (falha não conta)", () => {
    it("devolve 1 token consumido: libera um slot extra (padrão do saque)", async () => {
      // Fluxo real: consome dentro do limite, a última tentativa FALHA e é devolvida.
      for (let i = 0; i < 5; i++) {
        expect((await rateLimit({ key: "w", limit: 5, windowMs: 60_000 })).success).toBe(true);
      }
      // A 5ª (last) falhou no provedor → devolve o token.
      await refundRateLimit("w");
      // Cabe exatamente MAIS UMA (o retry imediato), depois bloqueia.
      expect((await rateLimit({ key: "w", limit: 5, windowMs: 60_000 })).success).toBe(true);
      expect((await rateLimit({ key: "w", limit: 5, windowMs: 60_000 })).success).toBe(false);
    });

    it("não desce abaixo de 0 (refund sem consumo prévio é no-op seguro)", async () => {
      await refundRateLimit("z"); // nunca consumiu
      const r = await rateLimit({ key: "z", limit: 5, windowMs: 60_000 });
      expect(r.success).toBe(true);
      expect(r.remaining).toBe(4); // 1ª tentativa normal, sem crédito fantasma
    });

    it("preserva a janela (TTL) — não é um reset", async () => {
      vi.useFakeTimers();
      await rateLimit({ key: "ttl", limit: 2, windowMs: 10_000 }); // count 1
      await rateLimit({ key: "ttl", limit: 2, windowMs: 10_000 }); // count 2 (esgota)
      await refundRateLimit("ttl"); // devolve → count 1
      expect((await rateLimit({ key: "ttl", limit: 2, windowMs: 10_000 })).success).toBe(true); // count 2
      // A janela original segue: passado o windowMs, zera de vez.
      vi.advanceTimersByTime(10_100);
      expect((await rateLimit({ key: "ttl", limit: 2, windowMs: 10_000 })).remaining).toBe(1);
      vi.useRealTimers();
    });
  });
});
