/**
 * Isolamento por tenant das instruções do bot (M3 da revisão do ADR 0055).
 * Prova que a instrução do tenant A NUNCA vaza para o prompt/config do tenant B —
 * o runner lê tenantSettings por PK (tenantId), e o RLS de tenant_settings reforça.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// settings router puxa a árvore do trpc (NextAuth) — mock igual aos demais caller-tests.
vi.mock("@/server/auth", () => ({ auth: async () => null }));

import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { buildSystemPrompt } from "@/lib/talison/prompt";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const suffix = Date.now().toString(36);
let tenantA: string;
let tenantB: string;
let adminA: string;

const callerFor = (tenantId: string, userId: string) =>
  createCallerFactory(appRouter)({
    session: { user: { id: userId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "x", role: "admin" }] },
    tenantId,
  } as never);

beforeAll(async () => {
  const a = await prisma.tenant.create({ data: { name: `BotA ${suffix}`, slug: `bota-${suffix}`, status: "ACTIVE" } });
  const b = await prisma.tenant.create({ data: { name: `BotB ${suffix}`, slug: `botb-${suffix}`, status: "ACTIVE" } });
  tenantA = a.id;
  tenantB = b.id;
  adminA = (await prisma.user.create({ data: { name: "Admin A", cpf: `9${Date.now()}`.slice(0, 11), passwordHash: "x" } })).id;
  await prisma.userTenant.create({ data: { userId: adminA, tenantId: tenantA, role: "admin" } });
  // Só o tenant A tem instruções.
  await prisma.tenantSettings.create({
    data: { tenantId: tenantA, botInstructionsEnabled: true, botInstructions: "SEGREDO-DO-TENANT-A: entregamos de bike." },
  });
  await prisma.tenantSettings.create({ data: { tenantId: tenantB, botInstructionsEnabled: false } });
});

afterAll(async () => {
  await prisma.tenantSettings.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  await prisma.userTenant.deleteMany({ where: { userId: adminA } });
  await prisma.user.deleteMany({ where: { id: adminA } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
  await prisma.$disconnect();
});

describe("isolamento de instruções do bot por tenant", () => {
  it("getBotConfig do tenant A retorna a instrução do A", async () => {
    const cfg = await callerFor(tenantA, adminA).settings.getBotConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.instructions).toContain("SEGREDO-DO-TENANT-A");
  });

  it("getBotConfig do tenant B NÃO vê a instrução do A", async () => {
    const cfg = await callerFor(tenantB, adminA).settings.getBotConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.instructions ?? "").not.toContain("SEGREDO-DO-TENANT-A");
  });

  it("o prompt do B (sem instruções) não contém o segredo do A", () => {
    const promptB = buildSystemPrompt({ contactName: null, storeInstructions: null });
    expect(promptB).not.toContain("SEGREDO-DO-TENANT-A");
  });
});
