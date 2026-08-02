/**
 * Gate de contenção do saque contra cache do LWK inflado (incidente
 * TXW20260719-00001): quando a carteira tem UTXOs gastos presos no cache, o
 * saldo lido está inflado e o saque quebraria tarde, no broadcast
 * (`bad-txns-inputs-missingorspent`). O guard bloqueia ANTES de chamar a Eulen.
 *
 * Invariantes cobertas:
 *  - QUALQUER tenant é guardado (não só a central);
 *  - corrupção CONFIRMADA (ratio + contagem acima do limiar): bloqueia (throw);
 *  - ESPLORA fora (outspend não responde): FAIL-OPEN — não bloqueia saque legítimo;
 *  - CARTEIRA ilegível (o LWK não lista os UTXOs): BLOQUEIA;
 *  - a amostra é limitada, pra o guard não pendurar o saque.
 *
 * A distinção entre Esplora fora e carteira ilegível é o ponto. "Não sei"
 * continua não sendo "está corrompido" quando quem falhou foi a Esplora — travar
 * saque por oscilação de terceiro seria pior que o risco. Mas quando o próprio
 * LWK não abre a carteira, o saldo que passou pelo gate veio desse mesmo cache:
 * aí não dá pra apostar num saque irreversível.
 *
 * CUIDADO COM A ATRIBUIÇÃO: esta guarda NÃO teria evitado o TXW20260727-00002.
 * Naquele saque o /balance funcionou, o `lwk.transfer` FOI transmitido (txid
 * 422f1668…5008ca, bloco 3991619) e só a resposta se perdeu no timeout — não
 * houve payout órfão, houve pagamento duplicado quando o app gravou FAILED e o
 * operador refez. Esse caso é tratado no PR #728. O que esta guarda cobre é o
 * TXW20260719-00001: saldo inflado por cache, off-ramp alocado, morte no
 * broadcast.
 *
 * Este arquivo absorveu o antigo `depix-cache-integrity-guard.test.ts`, que
 * exercitava a mesma função com os mesmos casos. Duas suítes para um guard só
 * significavam manter a mesma verdade em dois lugares — o padrão que este
 * sistema já pagou caro várias vezes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const findMany = vi.fn();
vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: unknown) => unknown) => fn({ tenantDepixWallet: { findMany } }),
}));

const getUtxos = vi.fn();
vi.mock("@/lib/services/lwk-service", () => ({
  getUtxos: (...a: unknown[]) => getUtxos(...a),
}));

vi.mock("@/server/services/sideswap-swap.service", () => ({ DEPIX_ASSET: "depix-asset-id" }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { assertWalletCacheHealthyForWithdraw } from "@/server/services/depix-cache-integrity.service";

/** Tenant comum — antes desta mudança, o guard nem olhava para ele. */
const TENANT = "22222222-2222-2222-2222-222222222222";

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
  return fetchMock;
}

beforeEach(() => {
  for (const m of [findMany, getUtxos]) m.mockReset();
  vi.unstubAllGlobals();
});

describe("assertWalletCacheHealthyForWithdraw", () => {
  it("guarda a carteira de um tenant comum, não só a central", async () => {
    // A regressão que motivou a mudança: antes, todo tenant que não fosse a
    // central saía do guard sem checagem nenhuma. Medido em produção, a carteira
    // espelho de um tenant divergia R$ 2.362 da central sem nada acusar.
    stubUtxosAndOutspend(8, 6);
    const err = await assertWalletCacheHealthyForWithdraw(TENANT).catch((e) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("PRECONDITION_FAILED");
    expect((err as TRPCError).message).toMatch(/desatualizado|6 de 8/i);
  });

  it("cache saudável (0 gastos): não bloqueia", async () => {
    stubUtxosAndOutspend(10, 0);
    await expect(assertWalletCacheHealthyForWithdraw(TENANT)).resolves.toBeUndefined();
  });

  it("gasto isolado abaixo do limiar (1/10): não bloqueia (ruído de sync)", async () => {
    stubUtxosAndOutspend(10, 1); // ratio 0.1 < 0.25
    await expect(assertWalletCacheHealthyForWithdraw(TENANT)).resolves.toBeUndefined();
  });

  it("BLOQUEIA quando o LWK não lista os UTXOs (carteira ilegível)", async () => {
    // Mudança deliberada de política (2026-07). Antes isto era fail-open, no
    // mesmo balde de "Esplora oscilou". Mas getUtxos falhando é a CARTEIRA não
    // abrindo — e o saldo que passou pelo gate saiu do mesmo cache. Autorizar um
    // saque irreversível em cima de um número que não dá pra conferir é o risco
    // maior.
    getUtxos.mockResolvedValue({ success: false, error: "LWK fora" });
    await expect(assertWalletCacheHealthyForWithdraw(TENANT)).rejects.toThrow(TRPCError);
  });

  it("FAIL-OPEN: Esplora derruba as checagens (outspend null) não bloqueia", async () => {
    const utxos = Array.from({ length: 10 }, (_, i) => ({
      txid: `tx${i}`,
      vout: 0,
      value: 100_000_000,
    }));
    getUtxos.mockResolvedValue({ success: true, utxos });
    // Toda checagem de outspend falha → cobertura insuficiente → não avalia.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as unknown as Response));
    await expect(assertWalletCacheHealthyForWithdraw(TENANT)).resolves.toBeUndefined();
  });

  it("limita a amostra numa carteira grande, pra não pendurar o saque", async () => {
    // O guard roda com um humano esperando. Sem teto de amostra, uma carteira de
    // 100 UTXOs viraria 100 idas à Esplora em série no meio do saque.
    const fetchMock = stubUtxosAndOutspend(100, 0);
    await assertWalletCacheHealthyForWithdraw(TENANT);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(12);
  });

  it("pede os UTXOs com timeout curto (o default de 60s é do cron)", async () => {
    stubUtxosAndOutspend(6, 0);
    await assertWalletCacheHealthyForWithdraw(TENANT);
    const opts = getUtxos.mock.calls[0]?.[1] as { timeoutMs?: number } | undefined;
    expect(opts?.timeoutMs).toBeLessThanOrEqual(10_000);
  });
});
