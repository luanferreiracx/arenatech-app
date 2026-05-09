import { describe, it, expect, beforeEach, vi } from "vitest";
import { rateLimit, clearRateLimitStore } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  it("allows requests within limit", () => {
    for (let i = 0; i < 5; i++) {
      const result = rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
      expect(result.success).toBe(true);
    }
  });

  it("returns decreasing remaining count", () => {
    const r1 = rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
    expect(r1.remaining).toBe(4);

    const r2 = rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
    expect(r2.remaining).toBe(3);

    const r3 = rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
    expect(r3.remaining).toBe(2);
  });

  it("blocks the 6th request when limit is 5", () => {
    for (let i = 0; i < 5; i++) {
      const result = rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
      expect(result.success).toBe(true);
    }

    const blocked = rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets after window expires", () => {
    vi.useFakeTimers();

    for (let i = 0; i < 5; i++) {
      rateLimit({ key: "test", limit: 5, windowMs: 1_000 });
    }

    const blocked = rateLimit({ key: "test", limit: 5, windowMs: 1_000 });
    expect(blocked.success).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(1_100);

    const afterReset = rateLimit({ key: "test", limit: 5, windowMs: 1_000 });
    expect(afterReset.success).toBe(true);
    expect(afterReset.remaining).toBe(4);

    vi.useRealTimers();
  });

  it("tracks different keys independently", () => {
    for (let i = 0; i < 5; i++) {
      rateLimit({ key: "user-a", limit: 5, windowMs: 60_000 });
    }

    const blockedA = rateLimit({ key: "user-a", limit: 5, windowMs: 60_000 });
    expect(blockedA.success).toBe(false);

    const allowedB = rateLimit({ key: "user-b", limit: 5, windowMs: 60_000 });
    expect(allowedB.success).toBe(true);
  });

  it("returns a reset timestamp in the future", () => {
    const before = Date.now();
    const result = rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
    expect(result.reset).toBeGreaterThanOrEqual(before + 60_000);
  });
});
