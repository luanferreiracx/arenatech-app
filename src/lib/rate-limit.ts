/**
 * In-memory rate limiter for development.
 * In production, replace with Redis-backed implementation (REDIS_URL).
 *
 * Uses a simple sliding window counter stored in a Map with TTL cleanup.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Unique key for the rate limit bucket (e.g. IP, userId) */
  key: string;
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

// In-memory store — cleared on server restart.
// TODO: Replace with Redis when REDIS_URL is available for production.
const store = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired entries (every 60s)
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, 60_000);
  // Allow Node.js to exit even if the interval is running
  if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }
}

/**
 * Check and consume a rate limit token.
 *
 * @example
 * const result = rateLimit({ key: `login:${ip}`, limit: 5, windowMs: 60_000 });
 * if (!result.success) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
 */
export function rateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  ensureCleanup();

  const now = Date.now();
  const existing = store.get(key);

  // Window expired or first request — start fresh
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { success: true, remaining: limit - 1, reset: resetAt };
  }

  // Within window
  existing.count += 1;

  if (existing.count > limit) {
    return { success: false, remaining: 0, reset: existing.resetAt };
  }

  return { success: true, remaining: limit - existing.count, reset: existing.resetAt };
}

/**
 * Reset rate limit for a given key (e.g. after successful login).
 */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/**
 * For testing: clear the entire store.
 */
export function clearRateLimitStore(): void {
  store.clear();
}
