/**
 * Rate limiter — Redis quando REDIS_URL configurado, in-memory fallback
 * em dev/test.
 *
 * Redis (gap Sg4): em deploys multi-instance (Next standalone com cluster
 * ou multi-pod), o contador in-memory NAO era compartilhado entre
 * processos — um atacante podia rodar `limit * N_workers` tentativas
 * por janela. Redis garante contador global.
 *
 * Algoritmo: INCR + EXPIRE atomicamente (PEXPIREAT no primeiro hit).
 * Janela "fixa" simples (nao sliding) — suficiente para anti-brute-force
 * e mais simples que a alternativa.
 */

import { logger } from "@/lib/logger";
import Redis from "ioredis";

interface RateLimitOptions {
  /** Unique key for the rate limit bucket (e.g. IP, userId) */
  key: string;
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

// ── Redis singleton ──────────────────────────────────────────────────
let redis: Redis | null = null;
let redisFailed = false;

/**
 * Há backend distribuído (Redis) disponível pro rate-limit? Usado por superfícies
 * que precisam ser FAIL-CLOSED (ex.: API de parceiros, ADR 0057): sem backend
 * compartilhado, o limite in-memory não é confiável em cluster, então a borda de
 * parceiro recusa em vez de liberar geral.
 */
export function hasDistributedRateLimit(): boolean {
  return getRedis() !== null;
}

/**
 * Teto efetivo de rate-limit para rotas PÚBLICAS quando NÃO há Redis distribuído.
 * Sem Redis, o rate-limit cai para in-memory, que não é compartilhado entre
 * instâncias serverless — o teto real vira `limit × nº_instâncias` (fail-open
 * silencioso, auditoria de segurança S3). Nesse modo degradado, devolve um teto
 * bem menor (`degraded`) e loga; com Redis, devolve o `normal`. Não é fail-closed
 * duro — a rota pública continua servindo, só com um limite conservador.
 */
export function degradedPublicLimit(normal: number, degraded: number): number {
  if (hasDistributedRateLimit()) return normal;
  logger.warn("rate-limit público sem backend distribuído — teto degradado", { normal, degraded });
  return degraded;
}

function getRedis(): Redis | null {
  if (redisFailed) return null;
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    redis = new Redis(url, {
      // Em prod, falhar ruidoso. Mas se Redis cair mid-flight, queremos
      // que rate-limit cai para "permissivo" (fail-open) — auth ainda
      // valida senha. Lazy connect evita exception em boot.
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    redis.on("error", (err) => {
      logger.warn("Rate-limit Redis error — fallback in-memory ate reconectar", {
        err: err instanceof Error ? err.message : String(err),
      });
    });
    return redis;
  } catch (err) {
    logger.error("Rate-limit: falha ao conectar Redis", {
      err: err instanceof Error ? err.message : String(err),
    });
    redisFailed = true;
    return null;
  }
}

// ── In-memory fallback ───────────────────────────────────────────────
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const store = new Map<string, RateLimitEntry>();
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(k);
      }
    }
  }, 60_000);
  if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }
}

function inMemoryRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  ensureCleanup();
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { success: true, remaining: limit - 1, reset: resetAt };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { success: false, remaining: 0, reset: existing.resetAt };
  }
  return { success: true, remaining: limit - existing.count, reset: existing.resetAt };
}

// ── API publica ──────────────────────────────────────────────────────

/**
 * Check and consume a rate limit token.
 *
 * @example
 * const result = await rateLimit({ key: `login:${ip}`, limit: 5, windowMs: 60_000 });
 * if (!result.success) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
 */
export async function rateLimit({ key, limit, windowMs }: RateLimitOptions): Promise<RateLimitResult> {
  const r = getRedis();
  if (!r) {
    return inMemoryRateLimit({ key, limit, windowMs });
  }

  try {
    const redisKey = `rl:${key}`;
    // Pipeline: INCR + PEXPIRE (so seta TTL na primeira chamada).
    const pipeline = r.pipeline();
    pipeline.incr(redisKey);
    pipeline.pttl(redisKey);
    const results = await pipeline.exec();
    if (!results) {
      // Pipeline falhou — fallback in-memory.
      return inMemoryRateLimit({ key, limit, windowMs });
    }
    const [incrRes, ttlRes] = results;
    const count = Number(incrRes?.[1] ?? 0);
    let ttl = Number(ttlRes?.[1] ?? -1);

    // Primeira ocorrencia: seta janela.
    if (ttl < 0) {
      await r.pexpire(redisKey, windowMs);
      ttl = windowMs;
    }

    const resetAt = Date.now() + ttl;
    if (count > limit) {
      return { success: false, remaining: 0, reset: resetAt };
    }
    return { success: true, remaining: Math.max(0, limit - count), reset: resetAt };
  } catch (err) {
    logger.warn("Rate-limit Redis falhou — fallback in-memory", {
      err: err instanceof Error ? err.message : String(err),
    });
    return inMemoryRateLimit({ key, limit, windowMs });
  }
}

/**
 * Devolve UM token consumido de uma janela (sem mexer no TTL — a janela segue
 * correndo). Usado quando uma tentativa NÃO deve contar contra o limite (ex.: saque
 * recusado pelo provedor: a falha não é do usuário e não deve travá-lo). Diferente de
 * `resetRateLimit`, que zera o balde inteiro. Nunca desce abaixo de 0.
 */
export async function refundRateLimit(key: string): Promise<void> {
  const r = getRedis();
  if (r) {
    try {
      const redisKey = `rl:${key}`;
      const v = await r.decr(redisKey);
      // Guarda contra underflow (refund sem incr prévio) — devolve a 0 sem perder TTL.
      if (v < 0) await r.incr(redisKey);
      return;
    } catch (err) {
      logger.warn("Rate-limit refund Redis falhou", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const entry = store.get(key);
  if (entry && entry.count > 0) entry.count -= 1;
}

/**
 * Reset rate limit for a given key (e.g. after successful login).
 */
export async function resetRateLimit(key: string): Promise<void> {
  const r = getRedis();
  if (r) {
    try {
      await r.del(`rl:${key}`);
      return;
    } catch (err) {
      logger.warn("Rate-limit reset Redis falhou", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  store.delete(key);
}

/** For testing: clear the entire store. */
export function clearRateLimitStore(): void {
  store.clear();
}
