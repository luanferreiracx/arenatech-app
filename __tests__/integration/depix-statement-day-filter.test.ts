/**
 * Finalização — Módulo 6 (DePix Wallet), DPX-1.
 *
 * O extrato da carteira filtrava por período com `lte: new Date(dateTo)` — sem
 * fim de dia nenhum. Filtrar UM dia deixava `gte` e `lte` no mesmo instante
 * (meia-noite UTC), e a tela onde o lojista confere o próprio dinheiro voltava
 * **vazia**.
 *
 * Medido na cópia de produção: filtrando 2026-07-28, o filtro antigo devolvia
 * **0** transações; o correto eram **11**.
 *
 * Este teste FALHA antes da correção.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Dia BRT usado no teste, e dois instantes dentro dele. */
const DIA = "2026-03-15";
/** 09:00 BRT = 12:00Z — meio do dia, qualquer filtro pega. */
const MEIO_DIA_BRT = new Date("2026-03-15T12:00:00.000Z");
/** 22:00 BRT = 01:00Z do dia SEGUINTE — o que o filtro cru perdia. */
const NOITE_BRT = new Date("2026-03-16T01:00:00.000Z");

let tenantId: string;
let userId: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ctx: any;
const txIds: string[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (c: any) => createCallerFactory(appRouter)(c);

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const user = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  tenantId = tenant.id;
  userId = user.id;
  ctx = {
    session: {
      user: { id: userId, isSuperAdmin: false },
      activeTenantId: tenantId,
      availableTenants: [
        { id: tenantId, slug: "arena-tech", role: "admin", modules: ["wallet", "depix-ops"] },
      ],
    },
    tenantId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withTenant: (fn: any) => withTenant(tenantId, fn),
  };

  for (const [i, quando] of [MEIO_DIA_BRT, NOITE_BRT].entries()) {
    const row = await prisma.tenantDepixTransaction.create({
      data: {
        tenantId,
        userId,
        number: `DPX1-${Date.now()}-${i}`,
        kind: "DEPOSIT",
        status: "COMPLETED",
        grossAmountCents: 1_000,
        netAmountCents: 1_000,
        createdAt: quando,
      },
      select: { id: true },
    });
    txIds.push(row.id);
  }
});

afterAll(async () => {
  await prisma.tenantDepixTransaction.deleteMany({ where: { id: { in: txIds } } });
  await prisma.$disconnect();
});

describe("DPX-1 — o extrato da carteira filtra o dia inteiro", () => {
  it("filtrar um único dia devolve as transações desse dia", async () => {
    const res = await call(ctx).depixTransaction.list({ dateFrom: DIA, dateTo: DIA });
    const encontrados = res.data.filter((t: { id: string }) => txIds.includes(t.id));

    // As DUAS entram: a do meio do dia e a das 22h BRT, que caía fora.
    expect(encontrados).toHaveLength(2);
  });

  it("não traz o que aconteceu já no dia BRT seguinte", async () => {
    const res = await call(ctx).depixTransaction.list({
      dateFrom: "2026-03-14",
      dateTo: "2026-03-14",
    });
    const encontrados = res.data.filter((t: { id: string }) => txIds.includes(t.id));
    expect(encontrados).toHaveLength(0);
  });
});
