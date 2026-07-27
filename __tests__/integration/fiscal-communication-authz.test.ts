/**
 * Auditoria 2026-07-25 — fiscal e communication sem nenhum gate de admin.
 *
 * Os dois routers tinham ZERO ocorrências de `isTenantAdmin`. Qualquer membro
 * do tenant podia cancelar uma NF-e já autorizada (desfaz documento fiscal na
 * SEFAZ, janela de 24h, mexe na apuração), emitir carta de correção (altera
 * oficialmente um documento emitido) e REVERTER um opt-out de LGPD.
 *
 * DECISÃO DO DONO (2026-07-27): EMITIR (`authorize`) continua livre — é rotina
 * de balcão, fecha a venda e entrega a nota ao cliente. O que virou admin é
 * DESFAZER/ALTERAR o documento e reverter o opt-out.
 *
 * `unsubscribeCustomer` (registrar o opt-out) também segue livre: é o operador
 * atendendo o pedido do cliente. Só a REVERSÃO é decisão de gestão.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "fiscal-comm-authz";
let tenantId: string, adminId: string, operatorId: string, customerId: string;
const invoiceIds: string[] = [];

function mkCtx(userId: string, role: "admin" | "operator") {
  return {
    session: {
      user: { id: userId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [
        { id: tenantId, slug: "arena-tech", role, modules: ["fiscal", "service-orders", "customers"] },
      ],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  } as any;
}
const call = (ctx: any) => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  operatorId = operator.id;
  customerId = (await prisma.customer.create({
    data: { tenantId, name: `${MARK}-c`, phone: "11944445555", unsubscribed: true },
  })).id;
});

afterAll(async () => {
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

/** Nota AUTORIZADA (estado em que cancelar/corrigir faz sentido). */
async function notaAutorizada() {
  const inv = await prisma.invoice.create({
    data: {
      tenantId,
      type: "NFE",
      status: "AUTHORIZED",
      recipientName: "Consumidor Final",
      recipientCpfCnpj: "",
      totalAmount: 100,
      number: Math.floor(Math.random() * 1_000_000) + 1,
      createdById: adminId,
    },
  });
  invoiceIds.push(inv.id);
  return inv.id;
}

describe("fiscal/communication — desfazer documento e reverter opt-out são de admin", () => {
  it("operador NÃO cancela NF-e autorizada", async () => {
    const id = await notaAutorizada();

    await expect(
      call(mkCtx(operatorId, "operator")).fiscal.cancel({
        invoiceId: id,
        reason: "Cancelamento de teste da auditoria",
      }),
    ).rejects.toThrow(/permiss/i);

    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(inv.status).toBe("AUTHORIZED"); // intacta
  });

  it("operador NÃO emite carta de correção", async () => {
    const id = await notaAutorizada();

    await expect(
      call(mkCtx(operatorId, "operator")).fiscal.correctionLetter({
        invoiceId: id,
        reason: "Correcao de teste com texto suficientemente longo.",
      }),
    ).rejects.toThrow(/permiss/i);
  });

  it("operador NÃO reverte opt-out de LGPD", async () => {
    await expect(
      call(mkCtx(operatorId, "operator")).communication.resubscribeCustomer({ customerId }),
    ).rejects.toThrow(/permiss/i);

    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(c.unsubscribed).toBe(true); // continua descadastrado
  });

  it("operador AINDA registra o opt-out (atende o pedido do cliente)", async () => {
    await expect(
      call(mkCtx(operatorId, "operator")).communication.unsubscribeCustomer({ customerId }),
    ).resolves.toBeDefined();
  });

  it("admin reverte o opt-out normalmente", async () => {
    await expect(
      call(mkCtx(adminId, "admin")).communication.resubscribeCustomer({ customerId }),
    ).resolves.toBeDefined();

    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(c.unsubscribed).toBe(false);
  });
});
