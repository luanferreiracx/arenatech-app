/**
 * Gate de contenção do saque contra cache do LWK inflado (incidente
 * TXW20260719-00001): quando a carteira CENTRAL tem UTXOs gastos presos no
 * cache, o saldo lido está inflado e o saque quebraria tarde, no broadcast
 * (`bad-txns-inputs-missingorspent`). O guard bloqueia ANTES de chamar a Eulen.
 *
 * Invariantes cobertas:
 *  - tenant não-central: no-op (o detector só cobre a carteira central);
 *  - corrupção CONFIRMADA (ratio + contagem acima do limiar): bloqueia (throw);
 *  - não-avaliável (Esplora/LWK fora): FAIL-OPEN — não bloqueia saque legítimo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const findUnique = vi.fn();
vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: unknown) => unknown) => fn({ tenant: { findUnique } }),
}));

const getUtxos = vi.fn();
vi.mock("@/lib/services/lwk-service", () => ({
  getUtxos: (...a: unknown[]) => getUtxos(...a),
}));

vi.mock("@/server/api/trpc", () => ({ CENTRAL_TENANT_SLUG: "arena-tech" }));
vi.mock("@/server/services/sideswap-swap.service", () => ({ DEPIX_ASSET: "depix-asset-id" }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { assertCentralCacheHealthyForWithdraw } from "@/server/services/depix-cache-integrity.service";

const CENTRAL = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

/** Monta N UTXOs; os `spentCount` primeiros a Esplora reporta como GASTOS. */
function stubUtxosAndOutspend(total: number, spentCount: number) {
  const utxos = Array.from({ length: total }, (_, i) => ({
    txid: `tx${i}`,
    vout: 0,
    value: 100_000_000, // 1 DePix cada
  }));
  getUtxos.mockResolvedValue({ success: true, utxos });
  const fetchMock = vi.fn(async (url: string) => {
    const idx = Number(/tx(\d+)/.exec(url)?.[1] ?? -1);
    return {
      ok: true,
      json: async () => ({ spent: idx < spentCount }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => {
  for (const m of [findUnique, getUtxos]) m.mockReset();
  vi.unstubAllGlobals();
  findUnique.mockResolvedValue({ id: CENTRAL });
});

describe("assertCentralCacheHealthyForWithdraw", () => {
  it("tenant não-central: no-op, não consulta a carteira", async () => {
    await expect(
      assertCentralCacheHealthyForWithdraw(OTHER, CENTRAL),
    ).resolves.toBeUndefined();
    expect(getUtxos).not.toHaveBeenCalled();
  });

  it("centralId null: no-op (não dá pra saber quem é a central)", async () => {
    await expect(
      assertCentralCacheHealthyForWithdraw(CENTRAL, null),
    ).resolves.toBeUndefined();
    expect(getUtxos).not.toHaveBeenCalled();
  });

  it("cache corrompido (6/8 gastos): BLOQUEIA com PRECONDITION_FAILED", async () => {
    stubUtxosAndOutspend(8, 6); // ratio 0.75 > 0.25 e 6 > 3
    const err = await assertCentralCacheHealthyForWithdraw(CENTRAL, CENTRAL).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("PRECONDITION_FAILED");
    expect((err as TRPCError).message).toMatch(/desatualizado|6 de 8/i);
  });

  it("cache saudável (0 gastos): não bloqueia", async () => {
    stubUtxosAndOutspend(10, 0);
    await expect(
      assertCentralCacheHealthyForWithdraw(CENTRAL, CENTRAL),
    ).resolves.toBeUndefined();
  });

  it("gasto isolado abaixo do limiar (1/10): não bloqueia (ruído de sync)", async () => {
    stubUtxosAndOutspend(10, 1); // ratio 0.1 < 0.25
    await expect(
      assertCentralCacheHealthyForWithdraw(CENTRAL, CENTRAL),
    ).resolves.toBeUndefined();
  });

  it("FAIL-OPEN: LWK indisponível (getUtxos falha) não bloqueia saque legítimo", async () => {
    getUtxos.mockResolvedValue({ success: false, error: "LWK fora" });
    await expect(
      assertCentralCacheHealthyForWithdraw(CENTRAL, CENTRAL),
    ).resolves.toBeUndefined();
  });

  it("FAIL-OPEN: Esplora derruba as checagens (outspend null) não bloqueia", async () => {
    const utxos = Array.from({ length: 10 }, (_, i) => ({ txid: `tx${i}`, vout: 0, value: 100_000_000 }));
    getUtxos.mockResolvedValue({ success: true, utxos });
    // Toda checagem de outspend falha → cobertura insuficiente → não avalia.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as unknown as Response));
    await expect(
      assertCentralCacheHealthyForWithdraw(CENTRAL, CENTRAL),
    ).resolves.toBeUndefined();
  });
});
