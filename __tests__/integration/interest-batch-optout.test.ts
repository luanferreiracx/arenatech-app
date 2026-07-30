/**
 * Finalização — Módulo 9, CL-2: o disparo em MASSA de interesses ignorava o
 * opt-out de LGPD.
 *
 * `Customer.unsubscribed` era verificado apenas em `communication.sendMessage`
 * (o envio um-a-um, pela tela de clientes). `interest.sendBatch` não consultava
 * nada — bastava mandar pelo painel de interesses para furar o descadastro, e
 * justamente pelo caminho que atinge várias pessoas de uma vez.
 *
 * O opt-out é da PESSOA, não do registro: um interesse não vinculado a cliente
 * (o caso dos 75 de produção, todos com `customer_id` nulo) tem que ser casado
 * pelo telefone. Sem isso o descadastro seria contornável só não vinculando.
 *
 * Roda pelo caller tRPC: é a procedure que precisa pular, não uma função interna.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const TELEFONE_CLIENTE = "(86) 99777-1234";
const TELEFONE_LEAD = "5586997771234"; // mesmo número, formato do painel/bot

let tenantId: string;
let adminId: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminCtx: any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  tenantId = tenant.id;
  adminId = (await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } })).id;

  adminCtx = {
    session: {
      user: { id: adminId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }],
    },
    tenantId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withTenant: (fn: any) => withTenant(tenantId, fn),
    headers: new Headers({ "x-forwarded-for": "127.0.0.1" }),
  };
});

beforeEach(async () => {
  await prisma.interest.deleteMany({ where: { tenantId, customerName: "Lead Optout Teste" } });
  await prisma.customer.deleteMany({ where: { tenantId, name: "Cliente Optout Teste" } });
});

afterAll(async () => {
  await prisma.interest.deleteMany({ where: { tenantId, customerName: "Lead Optout Teste" } });
  await prisma.customer.deleteMany({ where: { tenantId, name: "Cliente Optout Teste" } });
  await prisma.$disconnect();
});

async function criarCliente(opts: { descadastrado: boolean }) {
  return prisma.customer.create({
    data: {
      tenantId,
      name: "Cliente Optout Teste",
      phone: TELEFONE_CLIENTE,
      type: "PF",
      unsubscribed: opts.descadastrado,
      unsubscribedAt: opts.descadastrado ? new Date() : null,
    },
  });
}

async function criarLead(customerId: string | null) {
  return prisma.interest.create({
    data: {
      tenantId,
      customerId,
      customerName: "Lead Optout Teste",
      phone: TELEFONE_LEAD,
      type: "PURCHASE",
      desiredModel: "iPhone 15",
      status: "WAITING",
    },
  });
}

describe("CL-2 — disparo em massa respeita o opt-out de LGPD", () => {
  it("pula o lead VINCULADO a um cliente descadastrado", async () => {
    const cliente = await criarCliente({ descadastrado: true });
    const lead = await criarLead(cliente.id);

    const r = await call(adminCtx).interest.sendBatch({
      ids: [lead.id],
      message: "Chegou o aparelho que voce queria!",
    });

    expect(r.skipped).toBe(1);
    expect(r.sent).toBe(0);
  });

  it("pula o lead NÃO vinculado cujo telefone é de um cliente descadastrado", async () => {
    // Os 75 interesses de produção têm `customer_id` nulo. Sem casar por
    // telefone, o descadastro seria contornável só não vinculando o lead.
    await criarCliente({ descadastrado: true });
    const lead = await criarLead(null);

    const r = await call(adminCtx).interest.sendBatch({
      ids: [lead.id],
      message: "Chegou o aparelho que voce queria!",
    });

    expect(r.skipped).toBe(1);
    expect(r.sent).toBe(0);
  });

  it("envia normalmente para quem não se descadastrou", async () => {
    const cliente = await criarCliente({ descadastrado: false });
    const lead = await criarLead(cliente.id);

    const r = await call(adminCtx).interest.sendBatch({
      ids: [lead.id],
      message: "Chegou o aparelho que voce queria!",
    });

    expect(r.skipped).toBe(0);
    // Sem credencial de WhatsApp no ambiente de teste o envio é mock/erro —
    // o que importa aqui é que a procedure NÃO pulou por opt-out.
    expect(r.sent + r.errors).toBe(1);
  });
});
