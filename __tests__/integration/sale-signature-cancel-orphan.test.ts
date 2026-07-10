/**
 * Auditoria PDV — E1 (ao vivo): reenviar o termo de assinatura de uma VENDA
 * cancela o documento Autentique anterior (pendente), para não orfaná-lo
 * (créditos + link antigo assinável). Mesmo padrão do F7 da OS.
 *
 * Mocka autentique-service (spy em create/cancel), PDF e WhatsApp. Dirige
 * sendForSignature duas vezes na mesma venda e afirma que o 2º cancela o 1º.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@/server/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/pdf/sale-delivery-builder", () => ({
  buildSaleDeliveryPdf: async () => Buffer.from("%PDF-1.4 fake"),
}));

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
vi.mock("@/lib/whatsapp/send-with-fallback", () => ({
  sendPdfWithFallback: async () => ({ success: true, via: "mock" }),
}));

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "sale-sig-cancel-test";
let ctx: any, tenantId: string, adminId: string, customerId: string, saleId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  ctx = {
    session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] },
    tenantId, withTenant: (fn: any) => withTenant(tenantId, fn),
  };
  customerId = (await prisma.customer.create({
    data: { tenantId, name: `${MARK}-cliente`, phone: "11999990000" },
  })).id;
  saleId = (await prisma.sale.create({
    data: {
      tenantId, number: `${MARK}-${Date.now()}`, sellerId: adminId, customerId,
      publicLink: `${MARK}-link-${Date.now()}`, status: "COMPLETED" as any,
      totalAmount: 100, paidAmount: 100,
    },
  })).id;
});

afterAll(async () => {
  await prisma.saleAudit.deleteMany({ where: { saleId } });
  await prisma.sale.deleteMany({ where: { id: saleId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
});

describe("Auditoria PDV — E1 (ao vivo): reenvio de assinatura cancela doc anterior", () => {
  it("1º envio cria doc e NÃO cancela; 2º envio cancela o doc do 1º", async () => {
    const caller = createCallerFactory(appRouter)(ctx);

    await caller.sale.sendForSignature({ saleId });
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(cancelSpy).not.toHaveBeenCalled();

    const afterFirst = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(afterFirst.signatureDocumentId).toBe("doc-1");

    await caller.sale.sendForSignature({ saleId });
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(cancelSpy).toHaveBeenCalledWith("doc-1"); // ← o fix E1

    const afterSecond = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(afterSecond.signatureDocumentId).toBe("doc-2");
  });
});
