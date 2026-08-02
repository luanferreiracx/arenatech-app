/**
 * Auditoria 2026-07-25 — API-key de parceiro sobrevivia à suspensão do tenant.
 *
 * `validatePartnerApiKey` resolvia o tenant pela key e checava SÓ `revokedAt`.
 * Nunca lia `Tenant.status` nem `Tenant.apiAccessEnabled`:
 *
 *  - tenant SUSPENDED (inadimplente) ou CANCELLED (desligado pelo superadmin)
 *    continuava sacando DePix por `POST /api/v1/partner/depix/withdrawals` —
 *    dinheiro on-chain, IRREVERSÍVEL. O dono perdia o login e o painel, mas a
 *    key seguia valendo;
 *  - `apiAccessEnabled` só era consultado no router tRPC de GESTÃO da key
 *    (`assertApiAccessEnabled`), nunca na borda REST — desligar o toggle no
 *    painel não cortava o tráfego existente.
 *
 * Nenhum caminho de suspensão/cancelamento revogava as keys.
 *
 * ADR 0061 revisou UM ponto disto: `SUSPENDED` voltou a valer. Quem libera a API
 * é o toggle `apiAccessEnabled` do superadmin, e só ele — atrasar a mensalidade
 * não desliga a integração do parceiro pelas costas de quem a ligou, do mesmo
 * jeito que o bloqueio suave não tira a carteira do cliente. `PENDING` e
 * `CANCELLED` seguem recusados, e o toggle segue cortando o tráfego na hora.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { issuePartnerApiKey, validatePartnerApiKey } from "@/server/services/partner-api-key.service";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MARK = "partner-key-status";
let tenantId: string;
let plaintextKey: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: {
      name: `${MARK}-tenant`,
      slug: `${MARK}-${Date.now()}`,
      status: "ACTIVE",
      apiAccessEnabled: true,
    },
  });
  tenantId = tenant.id;
  const admin = await prisma.user.findFirstOrThrow({ where: { name: "Admin Arena" } });
  const issued = await issuePartnerApiKey({
    tenantId,
    name: `${MARK}-key`,
    scopes: ["depix:withdraw", "depix:read"],
    createdById: admin.id,
  });
  plaintextKey = issued.plaintextKey;
});

afterAll(async () => {
  await prisma.partnerApiKey.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

async function setTenant(data: { status?: string; apiAccessEnabled?: boolean }) {
  await prisma.tenant.update({ where: { id: tenantId }, data: data as never });
}

describe("API-key de parceiro — quem libera é o toggle do superadmin", () => {
  it("tenant ACTIVE com API ligada: a key funciona", async () => {
    await setTenant({ status: "ACTIVE", apiAccessEnabled: true });
    const r = await validatePartnerApiKey(plaintextKey);
    expect(r).not.toBeNull();
    expect(r!.tenantId).toBe(tenantId);
  });

  // ADR 0061: atraso de mensalidade não desliga a integração do parceiro. O
  // bloqueio suave tira os módulos PAGOS; a API, como a carteira, move dinheiro
  // do próprio cliente e segue de pé até o superadmin desligar o toggle.
  it("tenant SUSPENDED (inadimplente): a key CONTINUA valendo", async () => {
    await setTenant({ status: "SUSPENDED", apiAccessEnabled: true });
    const r = await validatePartnerApiKey(plaintextKey);
    expect(r).not.toBeNull();
    expect(r!.tenantId).toBe(tenantId);
  });

  it("tenant SUSPENDED com o toggle desligado: recusa (o toggle é quem manda)", async () => {
    await setTenant({ status: "SUSPENDED", apiAccessEnabled: false });
    expect(await validatePartnerApiKey(plaintextKey)).toBeNull();
  });

  it("tenant CANCELLED: a key PARA de valer (saída, não atraso)", async () => {
    await setTenant({ status: "CANCELLED", apiAccessEnabled: true });
    expect(await validatePartnerApiKey(plaintextKey)).toBeNull();
  });

  it("tenant PENDING: a key não vale (ainda não entrou)", async () => {
    await setTenant({ status: "PENDING", apiAccessEnabled: true });
    expect(await validatePartnerApiKey(plaintextKey)).toBeNull();
  });

  it("desligar apiAccessEnabled no painel corta o tráfego REST existente", async () => {
    await setTenant({ status: "ACTIVE", apiAccessEnabled: false });
    expect(await validatePartnerApiKey(plaintextKey)).toBeNull();
  });

  it("key revogada continua inválida (comportamento preservado)", async () => {
    await setTenant({ status: "ACTIVE", apiAccessEnabled: true });
    await prisma.partnerApiKey.updateMany({ where: { tenantId }, data: { revokedAt: new Date() } });
    expect(await validatePartnerApiKey(plaintextKey)).toBeNull();
    await prisma.partnerApiKey.updateMany({ where: { tenantId }, data: { revokedAt: null } });
  });
});
