/**
 * Middleware de autenticação da API de PARCEIROS (ADR 0057, Fase 1).
 *
 * Uso num route handler REST (/api/v1/partner/...):
 *
 *   export async function GET(req: NextRequest) {
 *     const auth = await withPartnerAuth(req, { scope: PARTNER_SCOPES.DEPIX_READ });
 *     if (auth instanceof Response) return auth;       // 401/403/429/503
 *     // auth.tenantId / auth.scopes — chamar o service via withTenant(auth.tenantId, …)
 *   }
 *
 * Garantias: Bearer obrigatório, key válida e não-revogada, escopo exigido
 * presente, e rate-limit FAIL-CLOSED por key (sem Redis em prod → 503). Nunca dá
 * acesso superadmin/withAdmin de negócio.
 */
import { NextRequest } from "next/server";
import { TRPCError } from "@trpc/server";
import { logger } from "@/lib/logger";
import { hasDistributedRateLimit, rateLimit } from "@/lib/rate-limit";
import { validatePartnerApiKey } from "@/server/services/partner-api-key.service";
import type { PartnerScope } from "@/lib/partner-api/scopes";

/** Mapeia um erro de service (TRPCError ou genérico) numa Response JSON. */
export function partnerErrorResponse(err: unknown, keyPrefix: string): Response {
  if (err instanceof TRPCError) {
    const status =
      err.code === "PRECONDITION_FAILED"
        ? 412
        : err.code === "BAD_REQUEST"
          ? 400
          : err.code === "NOT_FOUND"
            ? 404
            : err.code === "UNAUTHORIZED"
              ? 401
              : err.code === "FORBIDDEN"
                ? 403
                : 500;
    return new Response(JSON.stringify({ error: err.code.toLowerCase(), message: err.message }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
  logger.error("partner-api: erro interno", {
    keyPrefix,
    err: err instanceof Error ? err.message : String(err),
  });
  return new Response(JSON.stringify({ error: "internal", message: "Erro interno" }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
}

export interface PartnerContext {
  tenantId: string;
  keyId: string;
  keyPrefix: string;
  scopes: PartnerScope[];
}

interface PartnerAuthOptions {
  /**
   * Escopo exigido pra esta rota. Um array significa "QUALQUER um destes" (any-of) —
   * usado pelo status da transação, que aceita a key de depósito OU de saque.
   */
  scope: PartnerScope | PartnerScope[];
  /** Limite de req/min por key (default 60). Saques usam um menor. */
  ratePerMinute?: number;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function withPartnerAuth(
  req: NextRequest,
  opts: PartnerAuthOptions,
): Promise<PartnerContext | Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) {
    return json(401, { error: "unauthorized", message: "Authorization: Bearer <api-key> obrigatório" });
  }
  const presentedKey = m[1]!.trim();

  const validated = await validatePartnerApiKey(presentedKey);
  if (!validated) {
    return json(401, { error: "invalid_key", message: "API-key inválida ou revogada" });
  }

  const requiredScopes = Array.isArray(opts.scope) ? opts.scope : [opts.scope];
  const hasScope = requiredScopes.some((s) => validated.scopes.includes(s));
  if (!hasScope) {
    logger.warn("partner-api: escopo insuficiente", {
      keyPrefix: validated.keyPrefix,
      required: requiredScopes,
    });
    return json(403, {
      error: "insufficient_scope",
      message: `Escopo necessário: ${requiredScopes.join(" ou ")}`,
    });
  }

  // FAIL-CLOSED: sem backend distribuído de rate-limit em produção, recusa.
  if (process.env.NODE_ENV === "production" && !hasDistributedRateLimit()) {
    logger.error("partner-api: rate-limit sem backend distribuído — recusando (fail-closed)", {
      keyPrefix: validated.keyPrefix,
    });
    return json(503, { error: "unavailable", message: "Serviço temporariamente indisponível" });
  }

  const limit = opts.ratePerMinute ?? 60;
  const rl = await rateLimit({
    key: `partner:${validated.keyPrefix}:${requiredScopes.join(",")}`,
    limit,
    windowMs: 60_000,
  });
  if (!rl.success) {
    return json(429, { error: "rate_limited", message: "Limite de requisições excedido. Tente em instantes." });
  }

  return {
    tenantId: validated.tenantId,
    keyId: validated.keyId,
    keyPrefix: validated.keyPrefix,
    scopes: validated.scopes,
  };
}
