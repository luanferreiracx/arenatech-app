/**
 * Fôlego de gás da carteira central.
 *
 * O piso era o único limiar, e alarme no piso não dá tempo de reagir: quando
 * dispara, o próximo tenant que tentar sacar já falha com "Saque temporariamente
 * indisponível" — mensagem que mente, porque nada se recupera sozinho. Medido em
 * produção em 2026-08-02: 10.328 sats contra piso de 10.000, dois refills de
 * fôlego e nenhum aviso, porque estava tecnicamente acima.
 */
import { describe, it, expect } from "vitest";
import { evaluateLbtcRunway, LBTC_WARNING_REFILLS } from "@/lib/depix/lbtc-runway";

const REFILL = 5_000;
const FLOOR = 10_000;

const runway = (balanceSats: number) =>
  evaluateLbtcRunway({ balanceSats, refillSats: REFILL, floorSats: FLOOR });

describe("evaluateLbtcRunway", () => {
  it("conta o fôlego em refills, não em satoshis", () => {
    // É o número que responde a pergunta operacional: quantos tenants ainda dá
    // pra abastecer antes de o saque quebrar?
    expect(runway(26_000).refillsCovered).toBe(5);
    expect(runway(4_999).refillsCovered).toBe(0);
  });

  it("avisa ANTES do piso, com fôlego para reagir", () => {
    // O caso real de 2026-08-02: acima do piso, mas a três dedos dele.
    const atual = runway(10_328);
    expect(atual.level).toBe("warning");
    expect(atual.refillsCovered).toBe(2);
  });

  it("abaixo do piso continua sendo incidente", () => {
    expect(runway(FLOOR - 1).level).toBe("critical");
  });

  it("com fôlego confortável não incomoda ninguém", () => {
    expect(runway(LBTC_WARNING_REFILLS * REFILL).level).toBe("ok");
  });

  it("o aviso nunca fica abaixo do piso", () => {
    // Piso alto configurado à mão não pode deixar o degrau de aviso inútil,
    // preso embaixo do degrau crítico.
    const comPisoAlto = evaluateLbtcRunway({
      balanceSats: 100_000,
      refillSats: REFILL,
      floorSats: 90_000,
    });
    expect(comPisoAlto.warningSats).toBeGreaterThanOrEqual(90_000);
  });

  it("refill zerado por engano não vira divisão sem sentido", () => {
    // `DEPIX_LBTC_REFILL_SATS=0` no ambiente não pode produzir Infinity nem NaN
    // num monitor de dinheiro.
    const semRefill = evaluateLbtcRunway({
      balanceSats: 5_000,
      refillSats: 0,
      floorSats: FLOOR,
    });
    expect(Number.isFinite(semRefill.refillsCovered)).toBe(true);
    expect(semRefill.level).toBe("critical");
  });
});
