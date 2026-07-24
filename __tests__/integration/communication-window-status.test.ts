/**
 * B5 — communication.conversationWindowStatus: informa telefone/opt-out/janela
 * de 24h para a UI de envio (dialog de mensagem por cliente).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = `wstatus-${Date.now().toString(36)}`;
let tenantId: string, adminId: string, adminCtx: any;
const ids: string[] = [];
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
});

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

async function makeCustomer(data: { phone?: string; unsubscribed?: boolean }) {
  const c = await prisma.customer.create({
    data: {
      tenantId,
      name: `Cliente ${MARK}`,
      phone: data.phone ?? "",
      unsubscribed: data.unsubscribed ?? false,
      unsubscribedAt: data.unsubscribed ? new Date() : null,
    },
  });
  ids.push(c.id);
  return c;
}

describe("B5 — conversationWindowStatus", () => {
  it("cliente com telefone: hasPhone=true, fora da janela (stub), não opt-out", async () => {
    const c = await makeCustomer({ phone: "11999990000" });
    const res = await call(adminCtx).communication.conversationWindowStatus({ customerId: c.id });
    expect(res.hasPhone).toBe(true);
    expect(res.unsubscribed).toBe(false);
    expect(res.withinWindow).toBe(false);
  });

  it("cliente sem telefone: hasPhone=false", async () => {
    const c = await makeCustomer({ phone: "" });
    const res = await call(adminCtx).communication.conversationWindowStatus({ customerId: c.id });
    expect(res.hasPhone).toBe(false);
  });

  it("cliente opt-out (LGPD): unsubscribed=true", async () => {
    const c = await makeCustomer({ phone: "11999990001", unsubscribed: true });
    const res = await call(adminCtx).communication.conversationWindowStatus({ customerId: c.id });
    expect(res.unsubscribed).toBe(true);
  });
});
