/**
 * Etapa 7, Módulo 4 (M4-1): o lead descadastrado é pulado no disparo em massa.
 *
 * O teste unitário afirma que dá para REGISTRAR o opt-out. Este afirma que o
 * registro tem EFEITO — que é o que importa para a LGPD. Um campo
 * `unsubscribed` que ninguém consulta seria pior que não ter: daria a impressão
 * de que o pedido foi atendido.
 *
 * Roda contra o Postgres local, pelo caller real.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "optout-batch-test";
let tenantId: string, adminId: string, ctx: never;

beforeAll(async () => {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const a = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = t.id;
  adminId = a.id;
  ctx = {
    session: {
      user: { id: adminId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [
        { id: tenantId, slug: "arena-tech", role: "admin", modules: ["customers", "communication"] },
      ],
    },
    tenantId,
    withTenant: (fn: never) => withTenant(tenantId, fn),
  } as never;
});

afterAll(async () => {
  await prisma.interest.deleteMany({ where: { tenantId, customerName: { contains: MARK } } });
  await prisma.$disconnect();
});

const caller = () => createCallerFactory(appRouter)(ctx);

describe("M4-1 — opt-out do lead tem efeito no disparo em massa", () => {
  it("lead SEM Customer consegue se descadastrar e passa a ser pulado", async () => {
    const lead = await prisma.interest.create({
      data: {
        tenantId,
        customerName: `${MARK}-sem-customer`,
        phone: "5586999990001",
        customerId: null, // o caso dos 114 de produção
        status: "WAITING",
      },
    });

    // 1. Registra o "PARE".
    await caller().interest.unsubscribe({ id: lead.id });

    const depois = await prisma.interest.findUniqueOrThrow({ where: { id: lead.id } });
    expect(depois.unsubscribed).toBe(true);
    expect(depois.unsubscribedAt).toBeInstanceOf(Date);

    // 2. O disparo em massa PULA — não conta como enviado nem como erro.
    const res = await caller().interest.sendBatch({
      ids: [lead.id],
      message: "Chegou o aparelho que voce queria, temos em estoque agora.",
    });

    expect(res.sent, "não pode enviar para quem pediu para sair").toBe(0);
    expect(res.skipped, "deve contar como pulado, não como erro").toBe(1);
    expect(res.errors).toBe(0);
  });

  it("lead que NÃO pediu para sair continua recebendo (controle negativo)", async () => {
    const lead = await prisma.interest.create({
      data: {
        tenantId,
        customerName: `${MARK}-ativo`,
        phone: "5586999990002",
        customerId: null,
        status: "WAITING",
      },
    });

    const res = await caller().interest.sendBatch({
      ids: [lead.id],
      message: "Chegou o aparelho que voce queria, temos em estoque agora.",
    });

    // Sem WhatsApp configurado no teste o envio falha, mas o que importa é que
    // ele NÃO foi pulado por opt-out — `skipped` é a métrica sob teste.
    expect(res.skipped, "lead ativo não pode ser pulado").toBe(0);
  });
});
