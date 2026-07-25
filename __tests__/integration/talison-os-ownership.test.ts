/**
 * Auditoria 2026-07-25 — IDOR nas tools do Talison (bot do WhatsApp).
 *
 * `consultar_status_os` e `verificar_garantia` montavam o `where` com um
 * ternário EXCLUDENTE: informado o `numero_os`, o filtro de dono (`customerId`)
 * era DESCARTADO. Como o número da OS é sequencial, qualquer contato no
 * WhatsApp lia a OS de qualquer outro cliente do tenant — aparelho, status,
 * previsão e valor total — por um canal público e sem autenticação.
 *
 * A mensagem de erro ("...encontrada para este contato") afirmava um escopo que
 * o código não aplicava.
 *
 * Mesmo padrão em `buscar_cliente`: com `cpf` informado, ignorava o telefone do
 * contato e casava qualquer CPF do tenant → oráculo CPF→nome.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withTenant } from "@/server/db";
import { consultarStatusOs, verificarGarantia } from "@/lib/talison/tools/service-order";
import { buscarCliente } from "@/lib/talison/tools/customer";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "talison-idor";
let tenantId: string, adminId: string;
let vitimaId: string, atacanteId: string, osDaVitima: string;
const orderIds: string[] = [];

/** Contexto da tool como o runner monta, mas na pele do ATACANTE. */
function ctxComoAtacante() {
  return {
    tenantId,
    withTenant: (fn: any) => withTenant(tenantId, fn),
    conversation: {
      customerId: atacanteId,
      contactPhone: "5511900000002",
    },
  } as any;
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  adminId = admin.id;

  vitimaId = (await prisma.customer.create({
    data: { tenantId, name: `${MARK}-vitima`, phone: "5511900000001", cpf: "39053344705" },
  })).id;
  atacanteId = (await prisma.customer.create({
    data: { tenantId, name: `${MARK}-atacante`, phone: "5511900000002" },
  })).id;

  const os = await prisma.serviceOrder.create({
    data: {
      tenantId,
      number: `${MARK}-OS-${Date.now()}`,
      customerId: vitimaId,
      createdById: adminId,
      status: "DELIVERED",
      publicLink: `${MARK}-pl-${Date.now()}`,
      deviceModel: "iPhone 15 Pro Max da vítima",
      totalAmount: 4500,
      serviceAmount: 4500,
      warrantyMonths: 3,
      deliveredDate: new Date(),
    },
  });
  osDaVitima = os.number;
  orderIds.push(os.id);
});

afterAll(async () => {
  await prisma.serviceOrderHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.serviceOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: [vitimaId, atacanteId] } } });
  await prisma.$disconnect();
});

describe("Talison — tools não podem vazar dado de outro cliente", () => {
  it("consultar_status_os NÃO devolve a OS de outro cliente pelo número", async () => {
    const r: any = await consultarStatusOs.execute({ numero_os: osDaVitima }, ctxComoAtacante());
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("iPhone 15 Pro Max da vítima");
  });

  it("verificar_garantia NÃO devolve a garantia da OS de outro cliente", async () => {
    const r: any = await verificarGarantia.execute({ numero_os: osDaVitima }, ctxComoAtacante());
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("iPhone 15 Pro Max da vítima");
  });

  it("buscar_cliente NÃO vira oráculo CPF→nome (CPF de terceiro)", async () => {
    const r: any = await buscarCliente.execute({ cpf: "390.533.447-05" }, ctxComoAtacante());
    expect(JSON.stringify(r)).not.toContain(`${MARK}-vitima`);
  });

  it("o dono legítimo continua conseguindo consultar a própria OS", async () => {
    const ctxVitima = {
      tenantId,
      withTenant: (fn: any) => withTenant(tenantId, fn),
      conversation: { customerId: vitimaId, contactPhone: "5511900000001" },
    } as any;
    const r: any = await consultarStatusOs.execute({ numero_os: osDaVitima }, ctxVitima);
    expect(r.ok).toBe(true);
  });
});
