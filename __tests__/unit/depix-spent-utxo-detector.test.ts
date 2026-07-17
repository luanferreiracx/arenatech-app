/**
 * evaluateSpentUtxoRatio: detecta a classe de bug "cache do LWK conta UTXOs já
 * gastos como saldo" (incidente da carteira central, 2026-07 — 20 de 21 UTXOs
 * gastos). Pura e testável; o cron consulta o spent-status na Esplora e passa o
 * resultado aqui. Complementa o guard de exibição (resolveBalanceStaleness).
 */
import { describe, it, expect } from "vitest";
import { evaluateSpentUtxoRatio } from "@/lib/depix/spent-utxo-detector";

describe("evaluateSpentUtxoRatio", () => {
  it("nenhum UTXO gasto → sem alerta", () => {
    const alert = evaluateSpentUtxoRatio([
      { outpoint: "a:0", spent: false, valueSats: 100 },
      { outpoint: "b:1", spent: false, valueSats: 200 },
      { outpoint: "c:2", spent: false, valueSats: 300 },
      { outpoint: "d:3", spent: false, valueSats: 400 },
    ]);
    expect(alert).toBeNull();
  });

  it("1 gasto isolado numa carteira ativa → sem alerta (ruído normal)", () => {
    // 1 de 20 gastos: a próxima sync purga; não é a assinatura da corrupção.
    const utxos = Array.from({ length: 20 }, (_, i) => ({
      outpoint: `t${i}:0`,
      spent: i === 0,
      valueSats: 100,
    }));
    expect(evaluateSpentUtxoRatio(utxos)).toBeNull();
  });

  it("caso do incidente (20 de 21 gastos) → alerta com phantomSats correto", () => {
    // Reproduz a assinatura real: 20 UTXOs gastos presos + 1 vivo.
    const utxos = [
      { outpoint: "live:1", spent: false, valueSats: 13_121_815_000 }, // o R$131,21 real
      ...Array.from({ length: 20 }, (_, i) => ({
        outpoint: `spent${i}:0`,
        spent: true,
        valueSats: 1_000_000_000,
      })),
    ];
    const alert = evaluateSpentUtxoRatio(utxos);
    expect(alert).not.toBeNull();
    expect(alert!.spentCount).toBe(20);
    expect(alert!.totalCount).toBe(21);
    expect(alert!.phantomSats).toBe(20_000_000_000);
    expect(alert!.ratio).toBeCloseTo(20 / 21);
  });

  it("na fronteira dos limiares (3 de 12 = 25%) → alerta", () => {
    const utxos = Array.from({ length: 12 }, (_, i) => ({
      outpoint: `u${i}:0`,
      spent: i < 3,
      valueSats: 500,
    }));
    expect(evaluateSpentUtxoRatio(utxos)).not.toBeNull();
  });

  it("logo abaixo do mínimo absoluto (2 gastos) → sem alerta", () => {
    const utxos = Array.from({ length: 4 }, (_, i) => ({
      outpoint: `v${i}:0`,
      spent: i < 2,
      valueSats: 500,
    }));
    // 2/4 = 50% (passa o ratio) mas 2 < mínimo absoluto 3 → sem alerta.
    expect(evaluateSpentUtxoRatio(utxos)).toBeNull();
  });
});
