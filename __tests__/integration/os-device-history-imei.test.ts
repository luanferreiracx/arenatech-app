/**
 * B6 — serviceOrder.getDeviceHistoryByImei: histórico de OS do mesmo aparelho
 * (por IMEI/serial), excluindo a OS atual.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = `dev-hist-${Date.now().toString(36)}`;
const IMEI = "356938035643809";
let tenantId: string, adminId: string, customerId: string, adminCtx: any;
const orderIds: string[] = [];
const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  adminCtx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  const customer = await prisma.customer.create({
    data: { tenantId, name: `Cliente ${MARK}`, phone: "11955550000" },
  });
  customerId = customer.id;
});

afterAll(async () => {
  await prisma.serviceOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

async function makeOrder(opts: { imei?: string; serialNumber?: string; number: string }) {
  const o = await prisma.serviceOrder.create({
    data: {
      tenantId,
      number: `${MARK}-${opts.number}`,
      customerId,
      createdById: adminId,
      publicLink: `${MARK}-${opts.number}-${Math.random().toString(36).slice(2)}`,
      imei: opts.imei ?? null,
      serialNumber: opts.serialNumber ?? null,
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      reportedProblem: `problema ${opts.number}`,
    },
  });
  orderIds.push(o.id);
  return o;
}

describe("B6 — getDeviceHistoryByImei", () => {
  it("retorna outras OS do mesmo IMEI, excluindo a atual", async () => {
    const older = await makeOrder({ imei: IMEI, number: "1" });
    const current = await makeOrder({ imei: IMEI, number: "2" });

    const history = await call(adminCtx).serviceOrder.getDeviceHistoryByImei({
      imei: IMEI,
      excludeOrderId: current.id,
    });

    const ids = history.map((h: any) => h.id);
    expect(ids).toContain(older.id);
    expect(ids).not.toContain(current.id);
  });

  it("casa por número de série quando não há IMEI", async () => {
    const serial = `SN-${MARK}`;
    const bySerial = await makeOrder({ serialNumber: serial, number: "3" });

    const history = await call(adminCtx).serviceOrder.getDeviceHistoryByImei({
      serialNumber: serial,
    });
    expect(history.map((h: any) => h.id)).toContain(bySerial.id);
  });

  it("exige imei ou serial (input inválido rejeita)", async () => {
    await expect(
      call(adminCtx).serviceOrder.getDeviceHistoryByImei({}),
    ).rejects.toThrow();
  });
});
