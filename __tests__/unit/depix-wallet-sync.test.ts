/**
 * Sync periódico das carteiras do LWK.
 *
 * Existe porque o monitor de fundo do LWK fica desligado de propósito (ele também
 * detecta depósitos e dispara webhook, criando um 2º caminho além da Eulen). Sem
 * ninguém sincronizando, `last_sync_ok_at` congela e a UI avisa "saldo pode estar
 * desatualizado" — corretamente, já que nada garante que o número reflita a rede.
 *
 * O que estes testes fixam é o comportamento sob pressão: uma carteira que falha
 * não pode levar as outras junto, e o que não coube no orçamento tem de ser
 * REPORTADO — truncar em silêncio faria a rodada parecer completa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const syncWalletMock = vi.fn();
const listWalletsMock = vi.fn();

vi.mock("@/lib/services/lwk-service", () => ({
  syncWallet: (...args: unknown[]) => syncWalletMock(...args),
}));
vi.mock("@/server/services/depix-cache-integrity.service", () => ({
  listWalletsWithLwkCache: () => listWalletsMock(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function load() {
  const mod = await import("@/server/services/depix-wallet-sync.service");
  return mod.syncWalletsPeriodically;
}

describe("syncWalletsPeriodically", () => {
  beforeEach(() => {
    vi.resetModules();
    syncWalletMock.mockReset();
    listWalletsMock.mockReset();
  });

  it("sincroniza todas as carteiras provisionadas", async () => {
    listWalletsMock.mockResolvedValue(["t1", "t2", "t3"]);
    syncWalletMock.mockResolvedValue({ success: true });

    const run = await load();
    const r = await run();

    expect(syncWalletMock).toHaveBeenCalledTimes(3);
    expect(r).toMatchObject({ total: 3, synced: 3, failed: 0, skipped: 0 });
  });

  it("uma carteira que falha não impede as seguintes", async () => {
    listWalletsMock.mockResolvedValue(["t1", "t2", "t3"]);
    syncWalletMock
      .mockResolvedValueOnce({ success: false, error: "boom" })
      .mockResolvedValue({ success: true });

    const run = await load();
    const r = await run();

    expect(syncWalletMock).toHaveBeenCalledTimes(3);
    expect(r).toMatchObject({ total: 3, synced: 2, failed: 1 });
  });

  it("sem carteiras, não faz chamada nenhuma", async () => {
    listWalletsMock.mockResolvedValue([]);

    const run = await load();
    const r = await run();

    expect(syncWalletMock).not.toHaveBeenCalled();
    expect(r).toMatchObject({ total: 0, synced: 0 });
  });

  it("falha ao listar carteiras não derruba o cron", async () => {
    listWalletsMock.mockRejectedValue(new Error("db fora"));

    const run = await load();
    await expect(run()).resolves.toMatchObject({ total: 0, synced: 0 });
    expect(syncWalletMock).not.toHaveBeenCalled();
  });

  it("o que não coube no orçamento é reportado, nunca cortado em silêncio", async () => {
    listWalletsMock.mockResolvedValue(["t1", "t2", "t3", "t4"]);
    syncWalletMock.mockResolvedValue({ success: true });

    // Orçamento ja vencido: a rodada para na primeira carteira e reporta o resto.
    const run = await load();
    const r = await run(Date.now() - 60 * 60 * 1000);

    expect(r.skipped).toBe(4);
    expect(r.synced).toBe(0);
    expect(r.total).toBe(4);
  });
});

describe("syncWalletsPeriodically: anel entre rodadas", () => {
  beforeEach(() => {
    vi.resetModules();
    syncWalletMock.mockReset();
    listWalletsMock.mockReset();
  });

  it("rodadas seguintes começam adiante — carteira nenhuma fica órfã", async () => {
    // Orçamento cabe 1 por rodada: sem anel, a primeira seria sincronizada para
    // sempre e as outras três nunca, com o cron parecendo estar cobrindo tudo.
    listWalletsMock.mockResolvedValue(["t0", "t1", "t2", "t3"]);
    syncWalletMock.mockImplementation(async () => {
      // Consome o orçamento inteiro: só a primeira da rodada roda.
      vi.setSystemTime(Date.now() + 120_000);
      return { success: true };
    });
    vi.useFakeTimers();

    const run = await load();
    const CRON = 10 * 60_000;
    const vistos: string[] = [];
    for (let rodada = 0; rodada < 4; rodada += 1) {
      vi.setSystemTime(rodada * CRON);
      syncWalletMock.mockClear();
      await run(rodada * CRON);
      const chamada = syncWalletMock.mock.calls[0]?.[0];
      if (chamada) vistos.push(chamada as string);
    }
    vi.useRealTimers();

    // Quatro rodadas, quatro carteiras distintas: o anel girou.
    expect(new Set(vistos).size).toBe(4);
  });
});
