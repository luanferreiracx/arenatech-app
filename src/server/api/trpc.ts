import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";
import { auth } from "@/server/auth";
import { withTenant, withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { hasTenantAccess } from "@/lib/auth/active-tenant";
import { isTenantAdmin } from "@/lib/auth/roles";
import { CENTRAL_TENANT_SLUG } from "@/lib/tenants/central-tenant";
import { type ModuleKey } from "@/lib/modules";
import { isModuleAllowedForTenant, moduleDeniedMessage } from "@/server/auth/module-gate";

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
export const tenantProcedure = t.procedure.use(async ({ ctx, next, path }) => {
  if (!ctx.session?.user) {
    logger.warn("tenantProcedure: unauthenticated request");
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (!ctx.tenantId || !z.string().uuid().safeParse(ctx.tenantId).success) {
    logger.warn("tenantProcedure: no active tenant or invalid UUID", { userId: ctx.session.user.id });
    throw new TRPCError({ code: "FORBIDDEN", message: "Invalid tenant" });
  }

  // Validate that the authenticated user actually has access to this tenant
  if (!hasTenantAccess(ctx.session, ctx.tenantId)) {
    logger.warn("tenantProcedure: unauthorized tenant access attempt", {
      userId: ctx.session.user.id,
      tenantId: ctx.tenantId,
      isSuperAdmin: ctx.session.user.isSuperAdmin,
    });
    throw new TRPCError({ code: "FORBIDDEN", message: "No access to this tenant" });
  }

  assertModuleAllowed(ctx.session, ctx.tenantId, path);

  return next({
    ctx: {
      session: ctx.session,
      tenantId: ctx.tenantId,
      withTenant: <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant(ctx.tenantId!, fn),
    },
  });
});

/**
 * Gating de MÓDULO na borda tRPC (auditoria 2026-07-25).
 *
 * O gate por plano vivia SÓ no proxy e, por decisão documentada, **pula
 * `/api/*`**: um redirect 307 → HTML quebrava o cliente JSON (o tRPC recebia
 * "<!DOCTYPE" e derrubava TODAS as queries). A conclusão de que "tenantProcedure
 * já autoriza" confundiu duas coisas diferentes: `tenantProcedure` + RLS
 * garantem ISOLAMENTO (o dado é do tenant certo), não GATING DE PLANO. Um tenant
 * wallet-only chamava `stock.*`, `sale.*`, `financial.*` direto pela API — o
 * plano virava preferência de UI.
 *
 * Aqui a resposta é um `FORBIDDEN` tRPC normal (JSON), nunca um redirect — não
 * reintroduz o incidente. `settings` é sempre-on e o tenant de acesso total
 * (arena-tech) passa, espelhando `allowedModulesForTenant`.
 */
/**
 * Router tRPC → módulo comercializável. Só entram os routers que representam
 * funcionalidade de plano; os ausentes (auth, twoFactor, dashboard, search,
 * admin/superadmin, os depix* de wallet, settings) passam livres — ou porque
 * são sempre-on por design, ou porque têm gate próprio (adminProcedure,
 * centralTenantProcedure).
 *
 * Espelha `MODULE_ROUTE_PREFIXES` do gating de rota; se um router novo nascer
 * dentro de um módulo pago, some aqui.
 */
const ROUTER_MODULE: Record<string, ModuleKey> = {
  sale: "pdv",
  quickSale: "depix-ops",
  stock: "stock",
  catalog: "stock",
  nfeImport: "stock",
  cashier: "cashier",
  financial: "financial",
  receiving: "financial",
  recurringExpense: "financial",
  serviceOrder: "service-orders",
  operation: "service-orders",
  communication: "service-orders",
  customer: "customers",
  interest: "customers",
  reward: "customers",
  valuation: "tools",
  simulator: "tools",
  imei: "tools",
  fiscal: "fiscal",
  providerCommission: "commissions",
  partnerApiKey: "partner-api",
};

/**
 * Gating de MÓDULO na borda tRPC (auditoria 2026-07-25).
 *
 * O gate por plano vivia SÓ no proxy e, por decisão documentada, **pula
 * `/api/*`**: um redirect 307 → HTML quebrava o cliente JSON (o tRPC recebia
 * "<!DOCTYPE" e derrubava TODAS as queries de qualquer não-superadmin). A
 * conclusão de que "tenantProcedure já autoriza" confundiu duas coisas:
 * `tenantProcedure` + RLS garantem ISOLAMENTO (o dado é do tenant certo), não
 * GATING DE PLANO. Um tenant wallet-only chamava `stock.*`, `sale.*`,
 * `financial.*` direto pela API — o plano virava preferência de UI.
 *
 * Aqui a recusa é um `FORBIDDEN` tRPC normal (JSON), nunca um redirect — não
 * reintroduz o incidente. Aplicado uma vez em `tenantProcedure`, cobre as ~310
 * procedures sem tocar em cada uma.
 */
function assertModuleAllowed(
  session: NonNullable<Context["session"]>,
  tenantId: string,
  path: string,
): void {
  const routerName = path.split(".")[0] ?? "";
  const required = ROUTER_MODULE[routerName];
  if (!required) return; // router sem módulo comercializável → passa

  // Decisão compartilhada com as rotas REST (`server/auth/module-gate.ts`) —
  // duas implementações da mesma regra é o padrão que este programa encontrou em
  // três módulos.
  if (isModuleAllowedForTenant(session, tenantId, required)) return;

  logger.warn("tenantProcedure: modulo fora do plano do tenant", {
    userId: session.user.id,
    tenantId,
    path,
    required,
  });
  throw new TRPCError({ code: "FORBIDDEN", message: moduleDeniedMessage(required) });
}

/**
 * Tenant admin procedure — requer role administrativo no tenant ativo.
 * Use pra operacoes sensiveis (saques de carteira, alterar fee config,
 * etc) que NAO devem ser acessiveis pro operator/cashier comum, mesmo que
 * tenham sessao valida no tenant.
 */
export const tenantAdminProcedure = tenantProcedure.use(async ({ ctx, next }) => {
  if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
    logger.warn("tenantAdminProcedure: non-admin role access attempt", {
      userId: ctx.session.user.id,
      tenantId: ctx.tenantId,
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
 * Central tenant slug — fonte única em `@/lib/tenants/central-tenant` (módulo
 * leve, sem next-auth, importável por código puro/testável). Re-exportado aqui
 * para não quebrar os importadores server-side existentes.
 */
export { CENTRAL_TENANT_SLUG };

/**
 * Fee wallet tenant slug — carteira custodial operacional da Arena Tech,
 * dedicada a receber depositos de tenants non-custodial, reter a taxa e
 * repassar o liquido (ADR 0052). Tenant tecnico (sem usuarios), provisionado
 * pelo painel superadmin. NUNCA paga taxa de si mesmo.
 */
export const FEE_WALLET_TENANT_SLUG = "arena-fees";

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
