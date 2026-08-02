/**
 * Plano de cobertura do detector de cache: quem é checado nesta rodada.
 *
 * A pergunta que estes testes respondem é operacional, não estética: **com N
 * clientes, toda carteira acaba sendo checada?** Antes desta mudança o detector
 * olhava uma carteira só e as demais não tinham detector nenhum — foi assim que
 * uma carteira espelho ficou divergindo R$ 2.362 da central sem nada acusar.
 * Trocar "uma carteira" por "as primeiras N carteiras" repetiria o mesmo erro em
 * escala maior, então o que se testa aqui é a ROTAÇÃO.
 */
import { describe, it, expect } from "vitest";
import {
  planCacheIntegrityRun,
  MIN_USEFUL_SAMPLE,
} from "@/lib/depix/cache-integrity-plan";

const wallets = (n: number) => Array.from({ length: n }, (_, i) => `tenant-${i}`);

describe("planCacheIntegrityRun", () => {
  it("checa todas as carteiras quando o orçamento cobre todas", () => {
    const plan = planCacheIntegrityRun({
      tenantIds: wallets(3),
      runIndex: 0,
      totalOutpointBudget: 120,
      maxOutpointsPerWallet: 40,
    });
    expect(plan.checks.map((c) => c.tenantId).sort()).toEqual(wallets(3).sort());
    expect(plan.skipped).toEqual([]);
  });

  it("nenhuma carteira gasta mais que o teto por carteira", () => {
    const plan = planCacheIntegrityRun({
      tenantIds: wallets(2),
      runIndex: 0,
      totalOutpointBudget: 1000,
      maxOutpointsPerWallet: 40,
    });
    expect(plan.checks.every((c) => c.maxOutpoints <= 40)).toBe(true);
  });

  it("a rodada inteira respeita o orçamento global", () => {
    const plan = planCacheIntegrityRun({
      tenantIds: wallets(50),
      runIndex: 0,
      totalOutpointBudget: 80,
      maxOutpointsPerWallet: 40,
    });
    const gasto = plan.checks.reduce((sum, c) => sum + c.maxOutpoints, 0);
    expect(gasto).toBeLessThanOrEqual(80);
  });

  it("o que não coube é reportado, nunca cortado em silêncio", () => {
    const plan = planCacheIntegrityRun({
      tenantIds: wallets(50),
      runIndex: 0,
      totalOutpointBudget: 80,
      maxOutpointsPerWallet: 40,
    });
    expect(plan.skipped.length).toBe(50 - plan.checks.length);
    expect(plan.skipped.length).toBeGreaterThan(0);
  });

  it("rodadas seguintes começam adiante — carteira nenhuma fica órfã", () => {
    // O ponto do anel: com 10 carteiras e orçamento pra 2 por rodada, 5 rodadas
    // cobrem todo mundo. Sem rotação, as carteiras 3..10 nunca seriam checadas.
    const tenantIds = wallets(10);
    const vistas = new Set<string>();
    for (let runIndex = 0; runIndex < 5; runIndex += 1) {
      const plan = planCacheIntegrityRun({
        tenantIds,
        runIndex,
        totalOutpointBudget: 80,
        maxOutpointsPerWallet: 40,
      });
      for (const check of plan.checks) vistas.add(check.tenantId);
    }
    expect(vistas.size).toBe(tenantIds.length);
  });

  it("não distribui cota menor que a amostra mínima útil", () => {
    // Uma cota de 1 ou 2 outpoints não consegue bater os limiares do detector
    // (≥3 gastos E ≥25%), então gastaria Esplora pra produzir um "não sei".
    const plan = planCacheIntegrityRun({
      tenantIds: wallets(5),
      runIndex: 0,
      totalOutpointBudget: 43, // 40 + sobra de 3, abaixo do mínimo útil
      maxOutpointsPerWallet: 40,
    });
    expect(plan.checks.every((c) => c.maxOutpoints >= MIN_USEFUL_SAMPLE)).toBe(true);
  });

  it("sem carteiras, não há o que planejar", () => {
    const plan = planCacheIntegrityRun({
      tenantIds: [],
      runIndex: 7,
      totalOutpointBudget: 80,
      maxOutpointsPerWallet: 40,
    });
    expect(plan).toEqual({ checks: [], skipped: [] });
  });
});
