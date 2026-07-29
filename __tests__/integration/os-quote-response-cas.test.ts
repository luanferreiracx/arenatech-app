/**
 * Finalização — Módulo 4 (Ordens de Serviço), OS-1.
 *
 * `serviceOrder.respondToQuote` é PÚBLICO (o cliente aprova o orçamento por um
 * link, sem sessão). O guard de "já foi processado" é read-then-write: lê
 * `status === "pending"` e depois grava com `update({ where: { id } })`, sem
 * repetir a condição.
 *
 * Duas respostas concorrentes — o cliente clicando duas vezes, ou aprovando num
 * aparelho e rejeitando noutro — passam as duas. Cada uma mexe no orçamento E na
 * OS, então dá para terminar com o orçamento dizendo uma coisa e a ordem de
 * serviço, outra: um estado contraditório que nenhuma tela explica.
 *
 * Este teste FALHA antes da correção.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let tenantId: string;
let userId: string;
let customerId: string;
const orderIds: string[] = [];
const quoteIds: string[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const publicCaller = () =>
  createCallerFactory(appRouter)({
    session: null,
    // O `rateLimitMiddleware` deriva a chave do IP quando não há sessão, então o
    // contexto público precisa dos headers.
    headers: new Headers({ "x-forwarded-for": "203.0.113.10" }),
  } as any);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const user = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  userId = user.id;

  const customer = await prisma.customer.create({
    data: { tenantId, name: "Cliente OS-1", type: "PF", phone: "86999990001", createdById: userId },
    select: { id: true },
  });
  customerId = customer.id;
});

afterAll(async () => {
  await prisma.serviceOrderHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.serviceOrderQuote.deleteMany({ where: { id: { in: quoteIds } } });
  await prisma.serviceOrderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.serviceOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

/** OS com orçamento pendente aguardando a resposta do cliente. */
async function createPendingQuote(link: string): Promise<string> {
  const order = await prisma.serviceOrder.create({
    data: {
      tenantId,
      customerId,
      number: `OS1-${link}`,
      status: "IN_PROGRESS",
      budgetPending: true,
      deviceBrand: "Teste",
      deviceModel: "Teste",
      reportedProblem: "orcamento concorrente",
      totalAmount: new Prisma.Decimal(100),
      createdById: userId,
      publicLink: `pl-${link}`,
    },
    select: { id: true },
  });
  orderIds.push(order.id);

  const quote = await prisma.serviceOrderQuote.create({
    data: {
      tenantId,
      orderId: order.id,
      userId,
      approvalLink: link,
      status: "pending",
      reason: "orcamento de teste OS-1",
      previousTotal: new Prisma.Decimal(0),
      newTotal: new Prisma.Decimal(100),
    },
    select: { id: true },
  });
  quoteIds.push(quote.id);

  await prisma.serviceOrder.update({
    where: { id: order.id },
    data: { pendingQuoteId: quote.id },
  });
  return quote.id;
}

describe("OS-1 — o orçamento público não pode ser respondido duas vezes", () => {
  it("aprovação e rejeição simultâneas: uma vence, a outra é recusada", async () => {
    const link = `os1-conflito-${Date.now()}`;
    const quoteId = await createPendingQuote(link);

    const [aprovar, rejeitar] = await Promise.allSettled([
      publicCaller().serviceOrder.respondToQuote({ link, action: "approve" }),
      publicCaller().serviceOrder.respondToQuote({ link, action: "reject" }),
    ]);

    const desfechos = [aprovar.status, rejeitar.status].sort();
    expect(desfechos).toEqual(["fulfilled", "rejected"]);

    // O orçamento e a OS precisam contar a MESMA história.
    const quote = await prisma.serviceOrderQuote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(["approved", "rejected"]).toContain(quote.status);

    const order = await prisma.serviceOrder.findUniqueOrThrow({
      where: { id: quote.orderId },
    });
    expect(order.pendingQuoteId).toBeNull();
    expect(order.budgetPending).toBe(false);
  });

  it("duplo clique em aprovar registra o evento uma vez só", async () => {
    const link = `os1-duplo-${Date.now()}`;
    const quoteId = await createPendingQuote(link);

    await Promise.allSettled([
      publicCaller().serviceOrder.respondToQuote({ link, action: "approve" }),
      publicCaller().serviceOrder.respondToQuote({ link, action: "approve" }),
    ]);

    const quote = await prisma.serviceOrderQuote.findUniqueOrThrow({ where: { id: quoteId } });
    const historico = await prisma.serviceOrderHistory.count({
      where: { orderId: quote.orderId, notes: { contains: "Orcamento aprovado" } },
    });
    expect(historico).toBe(1);
  });
});
