/**
 * O guard de integridade consulta os UTXOs SEM forçar sync.
 *
 * Incidente 2026-08-06: o endpoint `/utxos` do LWK sincroniza a carteira por
 * padrão. Com a Esplora própria (VPS na França, Esplora no Brasil) esse sync
 * leva ~70s — acima do timeout do app. O guard falhava por timeout, reportava
 * `walletUnreadable` e bloqueava saque e depósito com a carteira íntegra.
 *
 * São duas razões independentes para não sincronizar aqui, e a segunda vale
 * mesmo que a latência um dia desapareça:
 *
 * 1. Custo — paga-se um full_scan para responder algo que o cache já sabe.
 * 2. Correção — este guard existe para auditar o que ESTÁ no cache. Sincronizar
 *    antes de medir mede o estado DEPOIS de consertado, escondendo justamente a
 *    corrupção que ele deveria detectar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const CENTRAL_ID = "dd308431-0525-417a-97c5-459e4b6cf45a";

const getUtxosMock = vi.fn();

vi.mock("@/lib/services/lwk-service", () => ({
  getUtxos: (...args: unknown[]) => getUtxosMock(...args),
}));
vi.mock("@/server/db", () => ({
  withAdmin: async (fn: (tx: unknown) => unknown) =>
    fn({ tenant: { findUnique: async () => ({ id: CENTRAL_ID }) } }),
}));
vi.mock("@/server/api/trpc", () => ({ CENTRAL_TENANT_SLUG: "arena-tech" }));
vi.mock("@/server/services/sideswap-swap.service", () => ({ DEPIX_ASSET: "depix-asset" }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("guard de integridade: consulta de UTXOs", () => {
  beforeEach(() => {
    vi.resetModules();
    getUtxosMock.mockReset();
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ spent: false }), { status: 200 })),
    );
  });

  it("pede os UTXOs com sync desligado", async () => {
    getUtxosMock.mockResolvedValue({
      success: true,
      utxos: Array.from({ length: 6 }, (_, i) => ({ txid: `t${i}`, vout: 0, value: 1000 })),
    });

    const mod = await import("@/server/services/depix-cache-integrity.service");
    await mod.checkWalletCacheIntegrity(CENTRAL_ID);

    expect(getUtxosMock).toHaveBeenCalledTimes(1);
    const [, opts] = getUtxosMock.mock.calls[0] ?? [];
    expect(opts).toMatchObject({ sync: false });
  });
});
