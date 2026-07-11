/**
 * Auditoria Comissão — J1/A6 + A4 (ao vivo).
 * J1/A6: getDetail/listProviders viraram admin. Operador NÃO vê a ficha de outro
 *        prestador; o prestador vê a PRÓPRIA via getMyDetail.
 * A4: updateRules não deixa repontar uma regra de OUTRO contrato (IDOR intra-tenant).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createCallerFactory } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { withTenant } from "@/server/db";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "comm-authz-test";
let tenantId: string, adminId: string, operatorId: string, adminCtx: any, operatorCtx: any;
let providerId: string, contractA: string, contractB: string, ruleBId: string, provB: string;
const YEAR = new Date().getFullYear(), MONTH = new Date().getMonth() + 1;

const call = (c: any) => createCallerFactory(appRouter)(c);
function mkCtx(userId: string, role: string) {
  return { session: { user: { id: userId, isSuperAdmin: false }, activeTenantId: tenantId, availableTenants: [{ id: tenantId, slug: "arena-tech", role }] }, tenantId, withTenant: (fn: any) => withTenant(tenantId, fn) };
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "arena-tech" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const operator = await prisma.user.findFirstOrThrow({ where: { name: "Operador Arena" } });
  tenantId = tenant.id; adminId = admin.id; operatorId = operator.id;
  adminCtx = mkCtx(adminId, "admin"); operatorCtx = mkCtx(operatorId, "operator");

  // Prestador do OPERADOR (para getMyDetail) + apuração.
  const provOp = await prisma.provider.create({ data: { tenantId, userId: operatorId, profile: "SELLER" as any } });
  providerId = provOp.id;
  await prisma.providerApuracao.create({ data: { tenantId, providerId, year: YEAR, month: MONTH, memoryJson: { linhas: [] } } });

  // Dois contratos de um MESMO prestador (admin) para o teste de IDOR A4.
  const provAdmin = await prisma.provider.create({ data: { tenantId, userId: adminId, profile: "SELLER" as any } });
  provB = provAdmin.id;
  contractA = (await prisma.providerContract.create({ data: { tenantId, providerId: provB, startDate: new Date(YEAR, 0, 1) } })).id;
  contractB = (await prisma.providerContract.create({ data: { tenantId, providerId: provB, startDate: new Date(YEAR, 0, 1) } })).id;
  ruleBId = (await prisma.providerCommissionRule.create({ data: { tenantId, contractId: contractB, category: "produto_acessorio", scope: "normal", valueType: "PERCENT", base: "PROFIT", source: "OWN", rangeMin: new Prisma.Decimal(0), rangeMax: null, rate: new Prisma.Decimal(5) } })).id;
});

afterAll(async () => {
  await prisma.providerCommissionRule.deleteMany({ where: { contractId: { in: [contractA, contractB] } } });
  await prisma.providerContract.deleteMany({ where: { id: { in: [contractA, contractB] } } });
  await prisma.providerApuracao.deleteMany({ where: { providerId: { in: [providerId, provB] } } });
  await prisma.provider.deleteMany({ where: { id: { in: [providerId, provB] } } });
  await prisma.$disconnect();
});

describe("Auditoria Comissão — J1/A6 + A4 (ao vivo)", () => {
  it("J1/A6: operador NÃO vê getDetail/listProviders; vê o próprio via getMyDetail", async () => {
    await expect(call(operatorCtx).providerCommission.getDetail({ providerId, year: YEAR, month: MONTH })).rejects.toThrow();
    await expect(call(operatorCtx).providerCommission.listProviders({ active: true })).rejects.toThrow();
    // getMyDetail resolve o prestador pela sessão (o operador É prestador aqui).
    const mine = await call(operatorCtx).providerCommission.getMyDetail({ year: YEAR, month: MONTH });
    expect(mine).toBeTruthy();
    // Admin vê getDetail normalmente.
    await expect(call(adminCtx).providerCommission.getDetail({ providerId, year: YEAR, month: MONTH })).resolves.toBeTruthy();
  });

  it("A4: updateRules não reponta regra de outro contrato (IDOR intra-tenant)", async () => {
    // Tenta atualizar, via contractA, a regra ruleBId que pertence ao contractB.
    await expect(
      call(adminCtx).providerCommission.updateRules({
        contractId: contractA,
        rules: [{ id: ruleBId, category: "produto_acessorio", scope: "normal", valueType: "PERCENT", base: "PROFIT", source: "OWN", rangeMin: 0, rangeMax: null, rate: 99 }],
      }),
    ).rejects.toThrow(/nao pertence|não pertence/i);
    // A regra do contractB segue intacta (rate 5, ainda no contractB).
    const rule = await prisma.providerCommissionRule.findUniqueOrThrow({ where: { id: ruleBId } });
    expect(rule.contractId).toBe(contractB);
    expect(Number(rule.rate)).toBe(5);
  });
});
