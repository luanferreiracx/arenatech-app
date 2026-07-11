/**
 * Auditoria Interesses — PR4 janela 24h + template (ao vivo).
 * O lead quase nunca falou com a loja → isWithin24hWindow() é stub `false` →
 * sendBatch cai no template aprovado `padrao` (contexto `lead_contato`), NÃO no
 * texto cru que a Meta rejeitaria fora da janela.
 * Verifica: envio via template, auditoria em whatsapp_messages_sent, interação
 * registrando o template, e status WAITING→CONTACTED.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "interest-tpl-test";
let tenantId: string, adminId: string, adminCtx: any;
const ids: string[] = [];

const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id; adminId = admin.id;
  adminCtx = { session: { user: { id: adminId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role: "admin" }] }, tenantId, withTenant: (fn: any) => withTenant(tenantId, fn) };
});

afterAll(async () => {
  await prisma.whatsappMessageSent.deleteMany({ where: { originType: "interest", originId: { in: ids } } });
  await prisma.message.deleteMany({ where: { referenceType: "interest", referenceId: { in: ids } } });
  await prisma.interestInteraction.deleteMany({ where: { interestId: { in: ids } } });
  await prisma.interest.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

async function makeInterest(desiredModel: string) {
  const i = await call(adminCtx).interest.create({
    customerName: `${MARK}-${Math.random()}`,
    phone: "11933330001",
    type: "PURCHASE",
    desiredModel,
  });
  ids.push(i.id);
  return i;
}

describe("Auditoria Interesses — PR4 janela 24h + template (ao vivo)", () => {
  it("fora da janela: envia via template padrão e registra tudo", async () => {
    const i = await makeInterest("iPhone 15 Pro");
    expect(i.status).toBe("WAITING");

    const res = await call(adminCtx).interest.sendBatch({
      ids: [i.id],
      message: "Mensagem livre só para quem está na janela de 24h",
    });
    expect(res.sent).toBe(1);
    expect(res.errors).toBe(0);

    // Auditoria: whatsapp_messages_sent registrou um envio via template.
    const logged = await prisma.whatsappMessageSent.findFirst({
      where: { originType: "interest", originId: i.id },
    });
    expect(logged).toBeTruthy();
    expect(logged!.type).toBe("template");
    expect(logged!.status).toBe("enviado");
    expect(logged!.templateName).toBe("padrao");

    // Interação registrou que foi por template.
    const inter = await prisma.interestInteraction.findFirst({
      where: { interestId: i.id, type: "WHATSAPP" },
    });
    expect(inter?.description).toMatch(/template/i);

    // Status avançou WAITING → CONTACTED + lastNotifiedAt gravado.
    const after = await prisma.interest.findUniqueOrThrow({ where: { id: i.id } });
    expect(after.status).toBe("CONTACTED");
    expect(after.lastNotifiedAt).not.toBeNull();
  });
});
