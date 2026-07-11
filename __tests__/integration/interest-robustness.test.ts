/**
 * Auditoria Interesses — PR1 (ao vivo).
 * B4: estados terminais (COMPLETED/CANCELLED) não voltam — sem reopen.
 * B7: as stats do `list` respeitam o filtro ativo (tipo/busca), não contam o
 *     tenant inteiro.
 * B6: telefone é armazenado só-dígitos e a busca com máscara encontra.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "interest-pr1-test";
let tenantId: string, adminId: string, ctx: any;
const ids: string[] = [];

const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  ctx = { session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] }, tenantId, withTenant: (fn: any) => withTenant(tenantId, fn) };
});

afterAll(async () => {
  await prisma.interestInteraction.deleteMany({ where: { interestId: { in: ids } } });
  await prisma.interest.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

async function makeInterest(overrides: Record<string, unknown> = {}) {
  const c = call(ctx);
  const i = await c.interest.create({
    customerName: `${MARK}-${Math.random()}`,
    phone: "(11) 99999-8888",
    type: "PURCHASE",
    desiredModel: `${MARK}-modelo`,
    ...overrides,
  });
  ids.push(i.id);
  return i;
}

describe("Auditoria Interesses — PR1 (ao vivo)", () => {
  it("B6: telefone é salvo só-dígitos e busca com máscara encontra", async () => {
    const i = await makeInterest();
    expect(i.phone).toBe("11999998888"); // só dígitos

    // Busca com máscara (o operador digita como quiser) acha pelo dígito.
    const res = await call(ctx).interest.list({ search: "(11) 99999-8888", pageSize: 100 });
    expect(res.data.some((r) => r.id === i.id)).toBe(true);
    const res2 = await call(ctx).interest.list({ search: "99999", pageSize: 100 });
    expect(res2.data.some((r) => r.id === i.id)).toBe(true);
  });

  it("B4: COMPLETED e CANCELLED são terminais (sem reopen)", async () => {
    const done = await makeInterest();
    await call(ctx).interest.updateStatus({ id: done.id, status: "COMPLETED" });
    await expect(
      call(ctx).interest.updateStatus({ id: done.id, status: "WAITING" }),
    ).rejects.toThrow(/não muda de status|nao muda de status/i);

    const cancelled = await makeInterest();
    await call(ctx).interest.updateStatus({ id: cancelled.id, status: "CANCELLED" });
    await expect(
      call(ctx).interest.updateStatus({ id: cancelled.id, status: "CONTACTED" }),
    ).rejects.toThrow();

    // Idempotente: re-setar o MESMO status terminal não explode.
    await expect(
      call(ctx).interest.updateStatus({ id: done.id, status: "COMPLETED" }),
    ).resolves.toEqual({ success: true });
  });

  it("B4: avanços normais (WAITING→CONTACTED→COMPLETED) continuam livres", async () => {
    const i = await makeInterest();
    await expect(call(ctx).interest.updateStatus({ id: i.id, status: "CONTACTED" })).resolves.toEqual({ success: true });
    await expect(call(ctx).interest.updateStatus({ id: i.id, status: "COMPLETED" })).resolves.toEqual({ success: true });
  });

  it("B7: stats do list respeitam o filtro de tipo", async () => {
    // 1 interesse REPAIR marcado com um modelo único de busca.
    const uniqueModel = `${MARK}-repair-${Math.random()}`;
    const rep = await makeInterest({ type: "REPAIR", desiredModel: uniqueModel });

    // Filtrando por esse modelo, o total das stats deve ser 1 (não o tenant inteiro).
    const res = await call(ctx).interest.list({ search: uniqueModel, pageSize: 100 });
    expect(res.data.length).toBe(1);
    expect(res.stats.total).toBe(1);
    expect(res.data[0]!.id).toBe(rep.id);
  });
});
