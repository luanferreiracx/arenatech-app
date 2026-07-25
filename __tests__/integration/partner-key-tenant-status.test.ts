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

describe("API-key de parceiro — só vale com tenant ACTIVE e API ligada", () => {
  it("tenant ACTIVE com API ligada: a key funciona", async () => {
    await setTenant({ status: "ACTIVE", apiAccessEnabled: true });
    const r = await validatePartnerApiKey(plaintextKey);
    expect(r).not.toBeNull();
    expect(r!.tenantId).toBe(tenantId);
  });

  it("tenant SUSPENDED (inadimplente): a key PARA de valer", async () => {
    await setTenant({ status: "SUSPENDED" });
    expect(await validatePartnerApiKey(plaintextKey)).toBeNull();
  });

  it("tenant CANCELLED: a key PARA de valer", async () => {
    await setTenant({ status: "CANCELLED" });
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
