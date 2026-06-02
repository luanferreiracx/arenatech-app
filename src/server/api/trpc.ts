import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";

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
    logger.warn("protectedProcedure: unauthenticated request");
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({
    ctx: { session: ctx.session },
  });
});

/**
 * Tenant procedure — requires session + active tenant. All queries run via withTenant.
 * Defense in depth: validates tenant access BOTH here AND in proxy.ts.
 * This ensures that even if the proxy matcher changes or a cookie is forged,
 * the backend rejects unauthorized tenant access.
 */
export const tenantProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    logger.warn("tenantProcedure: unauthenticated request");
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (!ctx.tenantId || !z.string().uuid().safeParse(ctx.tenantId).success) {
    logger.warn("tenantProcedure: no active tenant or invalid UUID", { userId: ctx.session.user.id });
    throw new TRPCError({ code: "FORBIDDEN", message: "Invalid tenant" });
  }

  // Validate that the authenticated user actually has access to this tenant
  const hasTenant = ctx.session.availableTenants.some(
    (t) => t.id === ctx.tenantId,
  );
  if (!hasTenant && !ctx.session.user.isSuperAdmin) {
    logger.warn("tenantProcedure: unauthorized tenant access attempt", {
      userId: ctx.session.user.id,
      tenantId: ctx.tenantId,
    });
    throw new TRPCError({ code: "FORBIDDEN", message: "No access to this tenant" });
  }

  return next({
    ctx: {
      session: ctx.session,
      tenantId: ctx.tenantId,
      withTenant: <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant(ctx.tenantId!, fn),
    },
  });
});

/**
 * Tenant admin procedure — requer role OWNER ou MANAGER no tenant ativo.
 * Use pra operacoes sensiveis (saques de carteira, alterar fee config,
 * etc) que NAO devem ser acessiveis pro operator/cashier comum, mesmo que
 * tenham sessao valida no tenant.
 */
const ADMIN_ROLES = new Set(["OWNER", "MANAGER", "owner", "manager"]);
export const tenantAdminProcedure = tenantProcedure.use(async ({ ctx, next }) => {
  const active = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId);
  const role = active?.role ?? "";
  if (!ADMIN_ROLES.has(role) && !ctx.session.user.isSuperAdmin) {
    logger.warn("tenantAdminProcedure: non-admin role access attempt", {
      userId: ctx.session.user.id,
      tenantId: ctx.tenantId,
      role,
    });
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acao restrita a administradores do tenant",
    });
  }
  // Repassa ctx refinado (session/tenantId/withTenant nao-null herdados de
  // tenantProcedure) sem widening.
  return next({
    ctx: {
      session: ctx.session,
      tenantId: ctx.tenantId,
      withTenant: ctx.withTenant,
    },
  });
});

/**
 * Super-admin-only tenant procedure — exige `isSuperAdmin` MAS continua operando
 * sobre o tenant ativo (mantém `tenantId` + `withTenant`). Use para configurações
 * sensíveis de um tenant que o PRÓPRIO tenant NÃO pode alterar — ex.: taxas do
 * simulador, taxas de parcelamento e a margem DePix de intermediação (que é a
 * receita da Arena Tech). O admin do tenant nem vê nem edita; só a Arena Tech
 * (super admin), impersonando o tenant, configura.
 */
export const superAdminTenantProcedure = tenantProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session.user.isSuperAdmin) {
    logger.warn("superAdminTenantProcedure: non-super-admin access attempt", {
      userId: ctx.session.user.id,
      tenantId: ctx.tenantId,
    });
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Apenas a Arena Tech pode alterar taxas.",
    });
  }
  return next({
    ctx: {
      session: ctx.session,
      tenantId: ctx.tenantId,
      withTenant: ctx.withTenant,
    },
  });
});

/**
 * Central tenant slug — single source of truth.
 * Resources gated behind centralTenantProcedure are exclusive to this tenant
 * (e.g., iPhone hunter that monitors REVENDA WhatsApp groups).
 */
export const CENTRAL_TENANT_SLUG = "arena-tech";

/**
 * Central tenant procedure — only the central tenant (arena-tech) can use it.
 * Extends tenantProcedure with a slug check against the user's available tenants.
 */
export const centralTenantProcedure = tenantProcedure.use(async ({ ctx, next }) => {
  const active = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId);
  if (active?.slug !== CENTRAL_TENANT_SLUG) {
    logger.warn("centralTenantProcedure: non-central tenant access attempt", {
      userId: ctx.session.user.id,
      tenantId: ctx.tenantId,
      slug: active?.slug,
    });
    throw new TRPCError({ code: "FORBIDDEN", message: "Recurso exclusivo do tenant central" });
  }
  return next({ ctx });
});

/** Admin procedure — requires isSuperAdmin. All queries run via withAdmin. */
export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    logger.warn("adminProcedure: unauthenticated request");
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (!ctx.session.user.isSuperAdmin) {
    logger.warn("adminProcedure: non-admin access attempt", { userId: ctx.session.user.id });
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a super admin" });
  }
  return next({
    ctx: {
      session: ctx.session,
      withAdmin,
    },
  });
});
