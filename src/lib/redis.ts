/**
 * Client Redis compartilhado (ioredis). Singleton lazy.
 *
 * Devolve null quando REDIS_URL não está configurado — cada caller decide o
 * fallback (rate-limit cai pra in-memory; debounce do Talison cai pra
 * processamento imediato). Não lança no boot.
 */

import Redis from "ioredis";
import { logger } from "@/lib/logger";

let client: Redis | null = null;
let failed = false;

export function getRedis(): Redis | null {
  if (failed) return null;
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    client.on("error", (err) => {
      logger.warn("Redis error", { err: err instanceof Error ? err.message : String(err) });
    });
    return client;
  } catch (err) {
    logger.error("Redis: falha ao conectar", {
      err: err instanceof Error ? err.message : String(err),
    });
    failed = true;
    return null;
  }
}
