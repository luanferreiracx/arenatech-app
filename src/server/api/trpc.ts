import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();
  const tenantId = opts.headers.get("x-tenant-id");

  return {
    headers: opts.headers,
    session,
    tenantId,
  };
};

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Public procedure — no auth required */
export const publicProcedure = t.procedure;

/** Protected procedure — requires valid session */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({
    ctx: { session: ctx.session },
  });
});

/** Tenant procedure — requires session + active tenant. All queries run via withTenant. */
export const tenantProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (!ctx.tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No active tenant" });
  }
  return next({
    ctx: {
      session: ctx.session,
      tenantId: ctx.tenantId,
      withTenant: <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant(ctx.tenantId!, fn),
    },
  });
});

/** Admin procedure — requires isSuperAdmin. All queries run via withAdmin. */
export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (!ctx.session.user.isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a super admin" });
  }
  return next({
    ctx: {
      session: ctx.session,
      withAdmin,
    },
  });
});
