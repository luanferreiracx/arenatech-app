import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  getFailedAttempts,
  _resetAllBuckets,
} from "@/lib/utils/rate-limit";

describe("rate-limit util", () => {
  beforeEach(() => {
    _resetAllBuckets();
  });

  it("permite primeira tentativa", () => {
    const r = checkRateLimit("test-key");
    expect(r.allowed).toBe(true);
    expect(r.remainingAttempts).toBe(5);
    expect(r.retryAfterMs).toBe(0);
  });

  it("decrementa attempts a cada falha", () => {
    recordFailedAttempt("k");
    expect(checkRateLimit("k").remainingAttempts).toBe(4);
    recordFailedAttempt("k");
    expect(checkRateLimit("k").remainingAttempts).toBe(3);
  });

  it("bloqueia apos 5 falhas com retryAfterMs > 0", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt("brute");
    const r = checkRateLimit("brute");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.remainingAttempts).toBe(0);
  });

  it("clearRateLimit reseta totalmente", () => {
    recordFailedAttempt("c");
    recordFailedAttempt("c");
    clearRateLimit("c");
    const r = checkRateLimit("c");
    expect(r.allowed).toBe(true);
    expect(r.remainingAttempts).toBe(5);
  });

  it("config customizada respeita maxAttempts", () => {
    const cfg = { maxAttempts: 3, windowMs: 60_000, lockoutMs: 60_000 };
    recordFailedAttempt("strict", cfg);
    recordFailedAttempt("strict", cfg);
    expect(checkRateLimit("strict", cfg).remainingAttempts).toBe(1);
    recordFailedAttempt("strict", cfg);
    expect(checkRateLimit("strict", cfg).allowed).toBe(false);
  });

  describe("getFailedAttempts (gate do captcha adaptativo)", () => {
    it("retorna 0 para chave sem falhas", () => {
      expect(getFailedAttempts("novo")).toBe(0);
    });

    it("conta as falhas acumuladas na janela", () => {
      recordFailedAttempt("login:123");
      recordFailedAttempt("login:123");
      recordFailedAttempt("login:123");
      expect(getFailedAttempts("login:123")).toBe(3);
    });

    it("cruza o limiar de 3 falhas (captcha passa a ser exigido)", () => {
      expect(getFailedAttempts("k") >= 3).toBe(false);
      recordFailedAttempt("k");
      recordFailedAttempt("k");
      expect(getFailedAttempts("k") >= 3).toBe(false);
      recordFailedAttempt("k");
      expect(getFailedAttempts("k") >= 3).toBe(true);
    });

    it("janela expirada zera a contagem", () => {
      const cfg = { maxAttempts: 5, windowMs: -1, lockoutMs: 60_000 };
      recordFailedAttempt("expira", cfg);
      // windowMs negativo → janela sempre considerada expirada.
      expect(getFailedAttempts("expira", cfg)).toBe(0);
    });
  });
});
