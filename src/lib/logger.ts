/**
 * Structured JSON logger.
 *
 * Outputs one JSON object per log line for easy parsing por agregadores
 * (CloudWatch, Datadog, Grafana Loki, etc.).
 *
 * Redacao automatica (gap Sg17): qualquer chave que case com SENSITIVE_KEYS
 * tem o valor substituido por "***" antes da serializacao. Cobre layers
 * comuns de vazamento de credentials/tokens em logs.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

/** Chaves cujo valor e sempre redigido nos logs. Match case-insensitive. */
const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "passwordconfirm",
  "currentpassword",
  "newpassword",
  "secret",
  "secret_key",
  "apikey",
  "api_key",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "authorization",
  "auth",
  "cookie",
  "set-cookie",
  "sessiontoken",
  "session_token",
  "creditcard",
  "credit_card",
  "cvv",
  "cvc",
  "pfx",
  "pfxpassword",
  "pfx_password",
  "privatekey",
  "private_key",
]);

const REDACTED = "***";
const MAX_DEPTH = 6;

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[depth-limit]";
  if (value == null) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, depth + 1));
  }
  // Buffer/Date/etc — nao recursamos.
  if (value instanceof Date || ArrayBuffer.isView(value)) return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = REDACTED;
    } else {
      out[k] = redactValue(v, depth + 1);
    }
  }
  return out;
}

function shouldLog(level: LogLevel): boolean {
  if (process.env.NODE_ENV === "production" && level === "debug") return false;
  return true;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const redactedCtx = context
    ? (redactValue(context, 0) as Record<string, unknown>)
    : undefined;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(redactedCtx ? { context: redactedCtx } : {}),
  };

  const json = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(json);
      break;
    case "warn":
      console.warn(json);
      break;
    default:
      console.log(json);
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => log("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log("error", msg, ctx),
};
