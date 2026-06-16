/**
 * Carteira de taxas custodial (ADR 0052): provisao idempotente + helpers.
 * Prisma (withAdmin) e o LWK sao mockados — testa a LOGICA do servico, nao o
 * banco nem o servico Python.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const tenantUpsert = vi.fn();
const tenantFindUnique = vi.fn();
const walletFindUnique = vi.fn();
const walletUpsert = vi.fn();
const createCustodialWallet = vi.fn();

// withAdmin(cb) executa o cb passando o "tx" mockado.
const tx = {
  tenant: {
    upsert: (...a: unknown[]) => tenantUpsert(...a),
    findUnique: (...a: unknown[]) => tenantFindUnique(...a),
  },
  tenantDepixWallet: {
    findUnique: (...a: unknown[]) => walletFindUnique(...a),
    upsert: (...a: unknown[]) => walletUpsert(...a),
  },
};

vi.mock("@/server/db", () => ({
  withAdmin: (cb: (t: typeof tx) => unknown) => cb(tx),
}));

vi.mock("@/lib/services/lwk-service", () => ({
  createCustodialWallet: (...a: unknown[]) => createCustodialWallet(...a),
}));

// trpc.ts arrasta NextAuth (next/server) — fora do escopo deste teste.
// So precisamos da constante do slug.
vi.mock("@/server/api/trpc", () => ({ FEE_WALLET_TENANT_SLUG: "arena-fees" }));

async function importService() {
  vi.resetModules();
  return import("@/server/services/depix-fee-wallet.service");
}

beforeEach(() => {
  tenantUpsert.mockReset();
  tenantFindUnique.mockReset();
  walletFindUnique.mockReset();
  walletUpsert.mockReset();
  createCustodialWallet.mockReset();
});

describe("getFeeWalletTenantId", () => {
  it("retorna null quando a carteira de taxas ainda nao existe", async () => {
    tenantFindUnique.mockResolvedValue(null);
    const { getFeeWalletTenantId } = await importService();
    expect(await getFeeWalletTenantId()).toBeNull();
  });

  it("resolve e cacheia o id (2a chamada nao consulta o banco)", async () => {
    tenantFindUnique.mockResolvedValue({ id: "fee-tenant-id" });
    const { getFeeWalletTenantId } = await importService();
    expect(await getFeeWalletTenantId()).toBe("fee-tenant-id");
    expect(await getFeeWalletTenantId()).toBe("fee-tenant-id");
    expect(tenantFindUnique).toHaveBeenCalledTimes(1);
  });
});

describe("ensureFeeWalletProvisioned", () => {
  it("no-op quando ja provisionada (nao chama o LWK)", async () => {
    tenantUpsert.mockResolvedValue({ id: "fee-tenant-id" });
    walletFindUnique.mockResolvedValue({
      masterAddress: "lq1existing",
      provisionedAt: new Date(),
    });
    const { ensureFeeWalletProvisioned } = await importService();

    const res = await ensureFeeWalletProvisioned();
    expect(res).toMatchObject({
      success: true,
      alreadyProvisioned: true,
      masterAddress: "lq1existing",
    });
    expect(createCustodialWallet).not.toHaveBeenCalled();
    expect(walletUpsert).not.toHaveBeenCalled();
  });

  it("provisiona via LWK e persiste o vinculo quando ausente", async () => {
    tenantUpsert.mockResolvedValue({ id: "fee-tenant-id" });
    walletFindUnique.mockResolvedValue(null);
    createCustodialWallet.mockResolvedValue({
      success: true,
      descriptor: "ct(desc)",
      masterAddress: "lq1new",
      network: "mainnet",
    });
    walletUpsert.mockResolvedValue({});
    const { ensureFeeWalletProvisioned } = await importService();

    const res = await ensureFeeWalletProvisioned();
    expect(res).toMatchObject({ success: true, masterAddress: "lq1new" });
    expect(createCustodialWallet).toHaveBeenCalledWith("fee-tenant-id");
    const persisted = walletUpsert.mock.calls[0]![0] as {
      create: { custodyModel: string; masterAddress: string };
    };
    expect(persisted.create.custodyModel).toBe("custodial");
    expect(persisted.create.masterAddress).toBe("lq1new");
  });

  it("falha (sem persistir) quando o LWK nao retorna a carteira", async () => {
    tenantUpsert.mockResolvedValue({ id: "fee-tenant-id" });
    walletFindUnique.mockResolvedValue(null);
    createCustodialWallet.mockResolvedValue({ success: false, error: "LWK indisponivel" });
    const { ensureFeeWalletProvisioned } = await importService();

    const res = await ensureFeeWalletProvisioned();
    expect(res.success).toBe(false);
    expect(walletUpsert).not.toHaveBeenCalled();
  });
});
