import { TRPCError } from "@trpc/server";
import { experimental_standaloneMiddleware } from "@trpc/server";
import { rateLimit } from "@/lib/rate-limit";
import { extractSourceIp } from "@/lib/webhooks/replay-guard";
import type { Context } from "@/server/api/trpc";

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

