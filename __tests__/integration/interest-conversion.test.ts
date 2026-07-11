/**
 * Auditoria Interesses — PR2 conversão (ao vivo).
 * B2: linkInterestConversionByPhone casa um interesse ABERTO por telefone e o
 *     marca COMPLETED + convertedAt + ref; respeita B4 (não toca terminal);
 *     escolhe o mais antigo quando há vários; ignora telefone curto.
 * markConverted: guarda CANCELLED; conversionStats reflete a conversão.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";
import { linkInterestConversionByPhone } from "@/server/services/interest-conversion.service";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "interest-conv-test";
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

async function makeInterest(phone: string, overrides: Record<string, unknown> = {}) {
  const i = await call(ctx).interest.create({
    customerName: `${MARK}-${Math.random()}`,
    phone,
    type: "PURCHASE",
    desiredModel: `${MARK}-modelo`,
    ...overrides,
  });
  ids.push(i.id);
  return i;
}

describe("Auditoria Interesses — PR2 conversão (ao vivo)", () => {
  it("B2: casa interesse aberto por telefone e marca convertido", async () => {
    const phone = "11955550001";
    const i = await makeInterest(`(11) 95555-0001`); // salvo só-dígitos = 11955550001
    const fakeSaleId = crypto.randomUUID();

    const convertedId = await ctx.withTenant((tx: any) =>
      linkInterestConversionByPhone(tx, { tenantId, phone, saleId: fakeSaleId }),
    );
    expect(convertedId).toBe(i.id);

    const after = await prisma.interest.findUniqueOrThrow({ where: { id: i.id } });
    expect(after.status).toBe("COMPLETED");
    expect(after.convertedAt).not.toBeNull();
    expect(after.convertedToSaleId).toBe(fakeSaleId);
  });

  it("B2: com vários abertos no mesmo telefone, converte o MAIS ANTIGO", async () => {
    const phone = "11955550002";
    const older = await makeInterest("11955550002");
    // garante ordem temporal distinta
    await new Promise((r) => setTimeout(r, 10));
    const newer = await makeInterest("11955550002");

    const convertedId = await ctx.withTenant((tx: any) =>
      linkInterestConversionByPhone(tx, { tenantId, phone, osId: crypto.randomUUID() }),
    );
    expect(convertedId).toBe(older.id);
    const newerAfter = await prisma.interest.findUniqueOrThrow({ where: { id: newer.id } });
    expect(newerAfter.status).not.toBe("COMPLETED"); // o mais novo segue aberto
  });

  it("B2/B4: NÃO converte interesse já terminal (CANCELLED)", async () => {
    const phone = "11955550003";
    const i = await makeInterest("11955550003");
    await call(ctx).interest.updateStatus({ id: i.id, status: "CANCELLED" });

    const convertedId = await ctx.withTenant((tx: any) =>
      linkInterestConversionByPhone(tx, { tenantId, phone, saleId: crypto.randomUUID() }),
    );
    expect(convertedId).toBeNull(); // só casa WAITING/CONTACTED
  });

  it("B2: telefone curto (<8 dígitos) não é chave — não converte", async () => {
    const i = await makeInterest("11955550004");
    const convertedId = await ctx.withTenant((tx: any) =>
      linkInterestConversionByPhone(tx, { tenantId, phone: "123", saleId: crypto.randomUUID() }),
    );
    expect(convertedId).toBeNull();
    const after = await prisma.interest.findUniqueOrThrow({ where: { id: i.id } });
    expect(after.status).toBe("WAITING");
  });

  it("markConverted manual: rejeita CANCELLED, converte aberto, e conversionStats sobe", async () => {
    const cancelled = await makeInterest("11955550005");
    await call(ctx).interest.updateStatus({ id: cancelled.id, status: "CANCELLED" });
    await expect(call(ctx).interest.markConverted({ id: cancelled.id })).rejects.toThrow(/cancelado/i);

    const open = await makeInterest("11955550006");
    const res = await call(ctx).interest.markConverted({ id: open.id });
    expect(res.status).toBe("COMPLETED");
    expect(res.convertedAt).not.toBeNull();

    const stats = await call(ctx).interest.conversionStats({});
    expect(stats.converted).toBeGreaterThanOrEqual(1);
    expect(stats.conversionRate).toBeGreaterThanOrEqual(0);
  });
});
