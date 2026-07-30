/**
 * Finalização — Módulo 8, CM-5: mês já apurado e fechado não aceita mexer nos
 * dias não cobertos, por nenhum dos dois caminhos.
 *
 * A guarda existia SÓ no self-service do prestador (`toggleMyUncoveredDay`). O
 * caminho do ADMIN (`toggleUncoveredDay`) — o que a loja usa — não tinha
 * nenhuma. É o padrão que este programa já encontrou em quatro módulos: duas
 * implementações do mesmo recurso, o endurecimento numa e os usuários na outra.
 *
 * O valor pago não muda (a apuração fechada não recalcula), mas os dias não
 * cobertos são a justificativa do rateio da ajuda de custo: mexer neles depois
 * do fechamento faz o registro discordar do que foi pago.
 *
 * Roda pelo caller tRPC de propósito — é a procedure que precisa recusar, não a
 * função interna.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const YEAR = 2097; // fora de qualquer dado semeado
const MONTH = 5;
const DIA = `${YEAR}-05-10`;

let tenantId: string;
let adminId: string;
let prestadorUserId: string;
let providerId: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminCtx: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prestadorCtx: any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (c: any) => createCallerFactory(appRouter)(c);

function mkCtx(userId: string, role: string) {
  return {
    session: {
      user: { id: userId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [{ id: tenantId, slug: "arena-tech", role }],
    },
    tenantId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withTenant: (fn: any) => withTenant(tenantId, fn),
    headers: new Headers({ "x-forwarded-for": "127.0.0.1" }),
  };
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  tenantId = tenant.id;
  adminId = (await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } })).id;

  const existente = await prisma.user.findFirst({ where: { cpf: "00000000353" } });
  prestadorUserId =
    existente?.id ??
    (await prisma.user.create({
      data: { cpf: "00000000353", name: "Prestador Guarda", passwordHash: "x" },
    })).id;

  providerId = (
    await prisma.provider.upsert({
      where: { tenantId_userId: { tenantId, userId: prestadorUserId } },
      update: {},
      create: { tenantId, userId: prestadorUserId, profile: "TECHNICIAN", bondType: "MEI" },
    })
  ).id;

  adminCtx = mkCtx(adminId, "admin");
  prestadorCtx = mkCtx(prestadorUserId, "operator");
});

afterAll(async () => {
  await prisma.providerUncoveredDay.deleteMany({ where: { providerId } });
  await prisma.providerApuracao.deleteMany({ where: { providerId } });
  await prisma.provider.deleteMany({ where: { id: providerId } });
  await prisma.$disconnect();
});

async function apuracaoCom(status: "OPEN" | "CLOSED") {
  await prisma.providerApuracao.deleteMany({ where: { providerId, year: YEAR, month: MONTH } });
  await prisma.providerApuracao.create({
    data: {
      tenantId,
      providerId,
      year: YEAR,
      month: MONTH,
      status,
      netAmount: new Prisma.Decimal(100),
      grossCommission: new Prisma.Decimal(100),
    },
  });
}

describe("CM-5 — dia não coberto de mês fechado", () => {
  it("o admin consegue marcar enquanto a apuração está aberta", async () => {
    await apuracaoCom("OPEN");
    await prisma.providerUncoveredDay.deleteMany({ where: { providerId } });

    const r = await call(adminCtx).providerCommission.toggleUncoveredDay({
      providerId,
      day: DIA,
      reason: "teste",
    });
    expect(r.action).toBe("added");
  });

  it("o admin é recusado depois do fechamento", async () => {
    await apuracaoCom("CLOSED");

    await expect(
      call(adminCtx).providerCommission.toggleUncoveredDay({
        providerId,
        day: DIA,
        reason: "teste",
      }),
    ).rejects.toThrow(/ja fechada/i);
  });

  it("o prestador também é recusado (a guarda já existia deste lado)", async () => {
    await apuracaoCom("CLOSED");

    await expect(
      call(prestadorCtx).providerCommission.toggleMyUncoveredDay({ day: DIA, reason: "teste" }),
    ).rejects.toThrow(/ja fechada/i);
  });

  it("o mês do dia é lido em UTC, não no fuso do processo", async () => {
    // "2097-05-01" vira meia-noite UTC. Lido com getMonth() num processo em BRT,
    // cairia em ABRIL e a guarda consultaria o mês errado.
    process.env.TZ = "America/Sao_Paulo";
    await apuracaoCom("CLOSED");

    await expect(
      call(adminCtx).providerCommission.toggleUncoveredDay({
        providerId,
        day: `${YEAR}-05-01`,
        reason: "primeiro dia",
      }),
    ).rejects.toThrow(/ja fechada/i);
  });
});
