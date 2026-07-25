/**
 * Auditoria 2026-07-25 — gating de módulo não existia na borda tRPC.
 *
 * O gate por plano vivia SÓ no proxy e, por decisão documentada, pula `/api/*`
 * (um redirect 307 → HTML quebrava o cliente JSON e derrubava TODAS as queries).
 * A conclusão de que "tenantProcedure já autoriza" confundiu ISOLAMENTO
 * (RLS: o dado é do tenant certo) com GATING DE PLANO.
 *
 * Resultado: tenant wallet-only navegava bloqueado em /stock, mas chamava
 * `stock.*`, `sale.*`, `financial.*` direto pela API com o próprio cookie de
 * sessão. O plano virava preferência de UI — bypass de monetização.
 *
 * Os dois lados importam:
 *  - tenant SEM o módulo é barrado com FORBIDDEN (JSON, não redirect);
 *  - tenant COM o módulo continua funcionando (guarda contra reintroduzir o
 *    incidente que motivou o `!pathname.startsWith("/api/")` no proxy).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "module-gating";
let walletTenantId: string, fullTenantId: string, userId: string;

/** Contexto com a lista de módulos que a sessão carregaria para o tenant. */
function ctxFor(tenantId: string, slug: string, modules: string[]) {
  return {
    session: {
      user: { id: userId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug, role: "admin", modules }],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  } as any;
}
const caller = (ctx: any) => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  userId = admin.id;
  walletTenantId = (await prisma.tenant.create({
    data: { name: `${MARK}-wallet`, slug: `${MARK}-wallet-${Date.now()}`, status: "ACTIVE" },
  })).id;
  fullTenantId = (await prisma.tenant.create({
    data: { name: `${MARK}-full`, slug: `${MARK}-full-${Date.now()}`, status: "ACTIVE" },
  })).id;
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [walletTenantId, fullTenantId] } } });
  await prisma.$disconnect();
});

/** Tenant NO-KYC / wallet-only: só wallet + depix-ops (NO_KYC_MODULES). */
const WALLET_ONLY = ["wallet", "depix-ops"];

describe("gating de módulo na borda tRPC", () => {
  it("tenant wallet-only é BARRADO em stock.* (antes passava direto pela API)", async () => {
    const ctx = ctxFor(walletTenantId, `${MARK}-wallet`, WALLET_ONLY);
    await expect(caller(ctx).stock.list({ page: 0, pageSize: 10 })).rejects.toThrow(
      /nao esta incluso no plano/i,
    );
  });

  it("tenant wallet-only é BARRADO em financial.* e serviceOrder.*", async () => {
    const ctx = ctxFor(walletTenantId, `${MARK}-wallet`, WALLET_ONLY);
    await expect(
      caller(ctx).financial.stats({ type: "RECEIVABLE" }),
    ).rejects.toThrow(/nao esta incluso no plano/i);
    await expect(
      caller(ctx).serviceOrder.list({ page: 0, pageSize: 10 }),
    ).rejects.toThrow(/nao esta incluso no plano/i);
  });

  it("o módulo que o tenant TEM continua funcionando (quickSale = depix-ops)", async () => {
    const ctx = ctxFor(walletTenantId, `${MARK}-wallet`, WALLET_ONLY);
    await expect(caller(ctx).quickSale.stats()).resolves.toBeDefined();
  });

  it("tenant COM o módulo não é afetado — não reintroduz o incidente do proxy", async () => {
    const ctx = ctxFor(fullTenantId, `${MARK}-full`, ["stock", "pdv", "financial", "cashier"]);
    await expect(caller(ctx).stock.list({ page: 0, pageSize: 10 })).resolves.toBeDefined();
  });

  it("dependência implícita vale: quem tem `pdv` alcança cashier/financial", async () => {
    const ctx = ctxFor(fullTenantId, `${MARK}-full`, ["pdv"]);
    await expect(caller(ctx).financial.stats({ type: "RECEIVABLE" })).resolves.toBeDefined();
  });

  it("settings é sempre-on mesmo para wallet-only", async () => {
    const ctx = ctxFor(walletTenantId, `${MARK}-wallet`, WALLET_ONLY);
    await expect(caller(ctx).settings.getGeneral()).resolves.toBeDefined();
  });
});
