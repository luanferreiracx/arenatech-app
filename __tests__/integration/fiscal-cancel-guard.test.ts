/**
 * Auditoria 2026-07-25 — item 26 (achado durante a correção do item 11, #723).
 *
 * O #723 barrou o ESTORNO de venda/OS com nota fiscal viva. Ficou o caminho
 * irmão: `fiscal.createFromServiceOrder` aceita OS em QUALQUER status, então dá
 * para emitir a nota de uma OS ainda não paga e depois CANCELÁ-LA — rota
 * diferente do estorno, e que continuava livre.
 *
 * Consequência idêntica à do item 11: a nota fica `AUTHORIZED` na SEFAZ e o
 * relatório fiscal (que só ignora `CANCELLED`) segue contando. A loja declara —
 * e recolhe imposto sobre — uma OS que deixou de existir.
 *
 * O cancelamento da OS tem quatro portas de entrada (`cancel`,
 * `confirmPhysicalSignature` com type=return, `confirmPhysicalReturnTerm` e
 * `checkReturnTermStatus`), todas passando por `applyOsCancellation` — que é
 * onde o guard entra, uma vez só.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "fiscal-cancel-guard";
let tenantId: string, adminId: string, ctx: any, customerId: string;
const orderIds: string[] = [];

const caller = () => createCallerFactory(appRouter)(ctx);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;
  ctx = {
    session: {
      user: { id: adminId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [
        { id: tenantId, slug: "arena-tech", role: "admin", modules: ["fiscal", "service-orders", "pdv"] },
      ],
    },
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  customerId = (
    await prisma.customer.create({ data: { tenantId, name: `${MARK}-cliente`, phone: "11988887777" } })
  ).id;
});

afterAll(async () => {
  for (const oid of orderIds) {
    const invs = await prisma.invoice.findMany({ where: { referenceId: oid }, select: { id: true } });
    const invIds = invs.map((i) => i.id);
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invIds } } });
    await prisma.financialTransaction.deleteMany({ where: { serviceOrderId: oid } });
    await prisma.serviceOrderHistory.deleteMany({ where: { orderId: oid } });
    await prisma.serviceOrder.deleteMany({ where: { id: oid } });
  }
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

let seq = 0;
/** OS em andamento (cancelável) — sem pagamento, que é o caso do buraco. */
async function makeOpenOrder() {
  seq += 1;
  const order = await prisma.serviceOrder.create({
    data: {
      tenantId,
      number: `${MARK}-${Date.now()}-${seq}`,
      customerId,
      createdById: adminId,
      status: "IN_PROGRESS" as any,
      publicLink: `${MARK}-link-${Date.now()}-${seq}`,
      serviceAmount: 300,
      totalAmount: 300,
      paidAmount: 0,
      budgetPending: false,
    },
  });
  orderIds.push(order.id);
  return order.id;
}

describe("26 — cancelamento de OS barrado enquanto a nota fiscal está viva", () => {
  it("OS com NF-e ativa não pode ser cancelada", async () => {
    const orderId = await makeOpenOrder();
    await caller().fiscal.createFromServiceOrder({ serviceOrderId: orderId, type: "NFSE" });

    await expect(
      caller().serviceOrder.cancel({ id: orderId, reason: "cliente desistiu do conserto" }),
    ).rejects.toThrow(/nota fiscal|documento fiscal/i);

    // A OS continua intacta — o cancelamento abortou antes de qualquer efeito.
    const order = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("IN_PROGRESS");
    expect(order.cancellationReason).toBeNull();
  });

  it("depois de cancelar a nota, o cancelamento da OS passa", async () => {
    const orderId = await makeOpenOrder();
    const nota = await caller().fiscal.createFromServiceOrder({ serviceOrderId: orderId, type: "NFSE" });
    await prisma.invoice.update({ where: { id: nota.id }, data: { status: "CANCELLED" } });

    await caller().serviceOrder.cancel({ id: orderId, reason: "cliente desistiu do conserto" });

    const order = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("CANCELLED");
  });

  it("a porta lateral do termo de devolução também é barrada", async () => {
    // `confirmPhysicalReturnTerm` cancela a OS sem passar pelo `cancel` — é
    // exatamente por isso que o guard vive no `applyOsCancellation` e não na
    // procedure. Se um dia alguém mover o guard para o `cancel`, este teste cai.
    const orderId = await makeOpenOrder();
    await caller().fiscal.createFromServiceOrder({ serviceOrderId: orderId, type: "NFSE" });

    await expect(
      caller().serviceOrder.confirmPhysicalReturnTerm({
        orderId,
        reason: "cliente retirou o aparelho sem conserto",
      }),
    ).rejects.toThrow(/nota fiscal|documento fiscal/i);

    const order = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("IN_PROGRESS");
  });

  it("OS sem nenhuma nota cancela normalmente (o guard não atrapalha o caso comum)", async () => {
    const orderId = await makeOpenOrder();

    await caller().serviceOrder.cancel({ id: orderId, reason: "aparelho sem conserto viavel" });

    const order = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("CANCELLED");
  });
});
