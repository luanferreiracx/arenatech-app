import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
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
});
