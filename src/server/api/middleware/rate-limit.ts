import { TRPCError } from "@trpc/server";
import { experimental_standaloneMiddleware } from "@trpc/server";
import { rateLimit, refundRateLimit } from "@/lib/rate-limit";
import { extractSourceIp } from "@/lib/webhooks/replay-guard";
import type { Context } from "@/server/api/trpc";

/**
 * Versao do rate-limit que NAO recria o ctx (preserva refinamentos de
 * middlewares anteriores como `tenantProcedure`/`tenantAdminProcedure`).
 * Use quando empilhar rate-limit em cima de procedures ja tipadas.
 *
 * `experimental_standaloneMiddleware` reseta o ctx pro tipo Context base
 * (session: Session | null, tenantId: string | null), causando erros TS
 * quando a procedure depende do narrowing feito antes.
 */
/** Handle devolvido pelo rate-limit: permite DEVOLVER o token consumido (refund)
 *  quando a tentativa não deve contar (ex.: saque recusado pelo provedor). */
export interface RateLimitHandle {
  /** Devolve 1 token à janela atual (não zera o balde, não mexe no TTL). */
  refund: () => Promise<void>;
}

export function enforceRateLimit({
  limit,
  windowMs,
}: {
  limit: number;
  windowMs: number;
}) {
  return async function rateLimitCheck(
    ctx: { headers: Headers; session: { user?: { id: string } } | null | undefined },
    path: string,
  ): Promise<RateLimitHandle> {
    const key =
      ctx.session?.user?.id ?? extractSourceIp(ctx.headers) ?? "anon";
    const fullKey = `trpc:${path}:${key}`;
    const result = await rateLimit({ key: fullKey, limit, windowMs });
    if (!result.success) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Try again in ${Math.ceil(
          (result.reset - Date.now()) / 1000,
        )}s.`,
      });
    }
    return { refund: () => refundRateLimit(fullKey) };
  };
}

interface RateLimitMiddlewareOptions {
  /** Max requests per window */
  limit: number;
  /** Window in milliseconds */
  windowMs: number;
  /**
   * Function to derive the rate limit key from context.
   * Defaults to user ID (authenticated) or "anon" (public).
   */
  keyFn?: (ctx: Context) => string;
}

/**
 * tRPC middleware that enforces rate limiting on a procedure.
 *
 * @example
 * const rateLimitedProcedure = publicProcedure.use(
 *   rateLimitMiddleware({ limit: 5, windowMs: 60_000 })
 * );
 */
export function rateLimitMiddleware({ limit, windowMs, keyFn }: RateLimitMiddlewareOptions) {
  return experimental_standaloneMiddleware<{ ctx: Context }>().create(
    async ({ ctx, next, path }) => {
      const key = keyFn
        ? keyFn(ctx)
        : ctx.session?.user?.id ?? extractSourceIp(ctx.headers) ?? "anon";

      const result = await rateLimit({
        key: `trpc:${path}:${key}`,
        limit,
        windowMs,
      });

      if (!result.success) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded. Try again in ${Math.ceil((result.reset - Date.now()) / 1000)}s.`,
        });
      }

      return next({ ctx });
    },
  );
}

