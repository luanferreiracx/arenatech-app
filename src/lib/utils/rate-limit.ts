/**
 * Rate limit in-memory simples para protecao contra brute force em login.
 *
 * Map global por chave (CPF) com contador + timestamp da janela e do lockout.
 * Defaults: 5 tentativas em 15 min → bloqueio por 15 min.
 *
 * NOTA: Funciona apenas em single-instance. Para producao multi-instance,
 * migrar para Redis (incr + expire). A interface foi desenhada para
 * facilitar essa migracao sem mudar callers.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
  lockedUntil: number | null;
}

const buckets = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000,
};

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterMs: number;
}

/**
 * Verifica se a chave pode tentar agora.
 * NAO incrementa o contador — chame `recordFailedAttempt` em caso de falha.
 */
export function checkRateLimit(key: string, config: RateLimitConfig = DEFAULT_CONFIG): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry) {
    return { allowed: true, remainingAttempts: config.maxAttempts, retryAfterMs: 0 };
  }

  // Em lockout ativo?
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterMs: entry.lockedUntil - now,
    };
  }

  // Janela expirou — reset implicito
  if (now - entry.windowStart > config.windowMs) {
    return { allowed: true, remainingAttempts: config.maxAttempts, retryAfterMs: 0 };
  }

  return {
    allowed: entry.count < config.maxAttempts,
    remainingAttempts: Math.max(0, config.maxAttempts - entry.count),
    retryAfterMs: 0,
  };
}

/**
 * Registra uma tentativa falha. Se atingir maxAttempts, ativa lockout.
 */
export function recordFailedAttempt(key: string, config: RateLimitConfig = DEFAULT_CONFIG): RateLimitResult {
  const now = Date.now();
  let entry = buckets.get(key);

  // Janela expirou — comeca nova
  if (!entry || now - entry.windowStart > config.windowMs) {
    entry = { count: 0, windowStart: now, lockedUntil: null };
  }

  entry.count++;

  if (entry.count >= config.maxAttempts) {
    entry.lockedUntil = now + config.lockoutMs;
  }

  buckets.set(key, entry);

  return {
    allowed: entry.count < config.maxAttempts,
    remainingAttempts: Math.max(0, config.maxAttempts - entry.count),
    retryAfterMs: entry.lockedUntil ? entry.lockedUntil - now : 0,
  };
}

/**
 * Quantas tentativas falhas estão registradas na janela atual.
 * Usado para decidir o desafio adaptativo (ex.: exigir Turnstile após N falhas).
 * Janela expirada conta como 0.
 */
export function getFailedAttempts(key: string, config: RateLimitConfig = DEFAULT_CONFIG): number {
  const entry = buckets.get(key);
  if (!entry) return 0;
  if (Date.now() - entry.windowStart > config.windowMs) return 0;
  return entry.count;
}

/**
 * Reseta o contador (chamado apos login bem-sucedido).
 */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** Util para testes: limpa todos os buckets */
export function _resetAllBuckets(): void {
  buckets.clear();
}
