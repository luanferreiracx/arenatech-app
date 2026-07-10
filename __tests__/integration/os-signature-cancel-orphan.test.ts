/**
 * Auditoria OS — F7 (ao vivo): reenviar termo/assinatura cancela o documento
 * Autentique anterior (pendente), para não deixá-lo órfão consumindo créditos
 * nem permitir que o cliente assine uma versão antiga.
 *
 * Mocka o autentique-service (spy em createDocumentWithLink/cancelDocument) e a
 * geração de PDF (custosa e irrelevante aqui). Dirige `sendForSignature` duas
 * vezes na mesma OS e afirma que o 2º envio cancela o doc do 1º.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@/server/auth", () => ({ auth: async () => null }));

// PDF builder — retorna um buffer qualquer (o conteúdo não importa pro fluxo).
vi.mock("@/lib/pdf/service-order-pdf-builder", () => ({
  buildServiceOrderPdf: async () => Buffer.from("%PDF-1.4 fake"),
}));

// Autentique — cada create devolve um id incremental; cancel é um spy.
let docSeq = 0;
const createSpy = vi.fn(async () => ({
  success: true as const,
  documentId: `doc-${++docSeq}`,
  signatureLink: `https://autentique.mock/${docSeq}`,
}));
const cancelSpy = vi.fn(async () => ({ success: true as const }));
vi.mock("@/lib/services/autentique-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/autentique-service")>();
  return {
    ...actual,
    createDocumentWithLink: (...args: unknown[]) => createSpy(...(args as [])),
    cancelDocument: (...args: unknown[]) => cancelSpy(...(args as [])),
  };
});

// WhatsApp — não dispara nada real.
vi.mock("@/lib/whatsapp/send-with-fallback", () => ({
  sendPdfWithFallback: async () => ({ success: true, via: "mock" }),
  sendTextWithFallback: async () => ({ success: true, via: "mock" }),
}));

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "os-sig-cancel-test";
let ctx: any, tenantId: string, adminId: string, customerId: string, orderId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  ctx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId, withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  const customer = await prisma.customer.create({
    data: { tenantId, name: `${MARK}-cliente`, phone: "11999990000" },
  });
  customerId = customer.id;
  const order = await prisma.serviceOrder.create({
    data: {
      tenantId, number: `${MARK}-${Date.now()}`, customerId, createdById: adminId,
      status: "IN_DIAGNOSIS" as any, publicLink: `${MARK}-link-${Date.now()}`,
      serviceAmount: 100, totalAmount: 100, paidAmount: 0, budgetPending: false,
    },
  });
  orderId = order.id;
});

afterAll(async () => {
  await prisma.serviceOrderHistory.deleteMany({ where: { orderId } });
  await prisma.serviceOrder.deleteMany({ where: { id: orderId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

describe("Auditoria OS — F7 (ao vivo): reenvio cancela doc anterior", () => {
  it("1º envio cria doc e NÃO cancela nada; 2º envio cancela o doc do 1º", async () => {
    const caller = createCallerFactory(appRouter)(ctx);

    // 1º envio — novo documento, sem cancelamento (não havia anterior).
    await caller.serviceOrder.sendForSignature({ orderId });
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(cancelSpy).not.toHaveBeenCalled();

    const afterFirst = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(afterFirst.signatureDocumentId).toBe("doc-1");

    // 2º envio (reenvio) — novo documento E cancela o anterior (doc-1).
    await caller.serviceOrder.sendForSignature({ orderId });
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(cancelSpy).toHaveBeenCalledWith("doc-1"); // ← o fix F7

    const afterSecond = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(afterSecond.signatureDocumentId).toBe("doc-2");
  });
});
