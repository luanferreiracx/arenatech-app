/**
 * Guard de saque contra cache corrompido do LWK (assertCentralCacheHealthyForWithdraw).
 *
 * Contexto: em 2026-07-27 o cache da carteira central corrompeu
 * (`UpdateOnDifferentStatus`) e o LWK passou horas respondendo `internal_error`
 * em /balance e /utxos.
 *
 * CUIDADO COM A ATRIBUIÇÃO: esta guarda NÃO teria evitado o TXW20260727-00002.
 * Naquele saque o /balance funcionou, o `lwk.transfer` FOI transmitido (txid
 * 422f1668…5008ca, bloco 3991619) e só a resposta se perdeu no timeout — não
 * houve payout órfão, houve pagamento duplicado quando o app gravou FAILED e o
 * operador refez. Esse caso é tratado no PR #728.
 *
 * O que esta guarda cobre é outra coisa: o guard é fail-open por design ("não
 * sei" ≠ "está corrompido"), o que está CERTO para uma Esplora que oscila, mas
 * errado quando o próprio LWK não consegue ler os UTXOs da carteira — aí o saldo
 * que passou pelo gate veio do mesmo cache que não abre. Um cache que não abre
 * não pode ser a base de um saque irreversível.
 *
 * Estes testes fixam o contrato nas duas direções: segue fail-open quando a Esplora
 * é que falhou (não trava saque legítimo), mas BLOQUEIA quando o LWK não devolve os
 * UTXOs da central — o caso do incidente.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const CENTRAL_ID = "dd308431-0525-417a-97c5-459e4b6cf45a";
const OTHER_TENANT = "11111111-2222-3333-4444-555555555555";

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

async function loadGuard() {
  const mod = await import("@/server/services/depix-cache-integrity.service");
  return mod.assertCentralCacheHealthyForWithdraw;
}

describe("assertCentralCacheHealthyForWithdraw", () => {
  beforeEach(() => {
    vi.resetModules();
    getUtxosMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("tenant não-central: nem consulta o LWK (o guard é só da carteira central)", async () => {
    const assertHealthy = await loadGuard();
    await expect(assertHealthy(OTHER_TENANT, CENTRAL_ID)).resolves.toBeUndefined();
    expect(getUtxosMock).not.toHaveBeenCalled();
  });

  it("cache limpo (nenhum UTXO gasto) → libera o saque", async () => {
    // Esplora responde: nada gasto.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ spent: false }), { status: 200 })),
    );
    getUtxosMock.mockResolvedValue({
      success: true,
      utxos: Array.from({ length: 6 }, (_, i) => ({ txid: `t${i}`, vout: 0, value: 1000 })),
    });

    const assertHealthy = await loadGuard();
    await expect(assertHealthy(CENTRAL_ID, CENTRAL_ID)).resolves.toBeUndefined();
  });

  it("corrupção confirmada (maioria dos UTXOs gastos) → BLOQUEIA com PRECONDITION_FAILED", async () => {
    // Assinatura do incidente: praticamente todo UTXO do cache já foi gasto.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ spent: true }), { status: 200 })),
    );
    getUtxosMock.mockResolvedValue({
      success: true,
      utxos: Array.from({ length: 8 }, (_, i) => ({ txid: `s${i}`, vout: 0, value: 1000 })),
    });

    const assertHealthy = await loadGuard();
    await expect(assertHealthy(CENTRAL_ID, CENTRAL_ID)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("Esplora indisponível (não dá pra checar spent-status) → fail-open, não trava saque legítimo", async () => {
    // "Não sei" ≠ "está corrompido": Esplora pública oscila o tempo todo e não
    // pode virar bloqueio de saque.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 502 })));
    getUtxosMock.mockResolvedValue({
      success: true,
      utxos: Array.from({ length: 6 }, (_, i) => ({ txid: `u${i}`, vout: 0, value: 1000 })),
    });

    const assertHealthy = await loadGuard();
    await expect(assertHealthy(CENTRAL_ID, CENTRAL_ID)).resolves.toBeUndefined();
  });

  it("REGRESSÃO TXW20260727-00002: LWK não devolve os UTXOs da central → guard NÃO pode liberar", async () => {
    // O cache corrompido (`UpdateOnDifferentStatus`) faz o LWK responder
    // internal_error em /utxos. O saldo que passou pelo gate veio DESSE mesmo
    // cache quebrado — sacar aqui aloca off-ramp na Eulen e morre no transfer.
    getUtxosMock.mockResolvedValue({ success: false, error: "LWK indisponivel" });

    const assertHealthy = await loadGuard();
    await expect(assertHealthy(CENTRAL_ID, CENTRAL_ID)).rejects.toBeInstanceOf(TRPCError);
  });
});
