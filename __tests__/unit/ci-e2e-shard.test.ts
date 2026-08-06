/**
 * Sharding do E2E (2026-08-06).
 *
 * Motivação medida, não estimada. Nos últimos 5 merges na `main`:
 *
 * | job | média |
 * |---|---|
 * | E2E | **9,9 min** |
 * | Build & push Docker | 9,8 min (self-hosted, é a VPS) |
 * | resto | < 4 min |
 *
 * E dentro do E2E: **7,2 min de teste** contra 2,4 min de setup. Três shards em
 * paralelo levam a parte de teste a ~2,4 min → job em ~4,8 min.
 *
 * **Por que shard e não `workers`.** São ideias parecidas com riscos opostos:
 *
 * - Subir `workers` roda os testes concorrentes **no mesmo banco**. 9 dos 24
 *   arquivos de spec mexem em sessão de caixa, que colide sob concorrência
 *   (índice único parcial `cash_sessions_one_open_per_user`). Já vimos essa
 *   flakiness em ~60% das execuções nos testes de integração.
 * - Cada shard é um **job separado**, com seu próprio serviço de Postgres e
 *   banco limpo. Não há estado compartilhado para colidir.
 *
 * `workers: 1` dentro do shard continua valendo (ADR 0039).
 *
 * Verificado antes de commitar: a partição é exata (60+60+60 = 180 no full,
 * 10+10+10 = 30 no smoke) e o shard 1 executou 10/10 em 26s contra a aplicação
 * real — pegando justamente os testes de caixa, porque o Playwright agrupa por
 * arquivo e isso preserva o isolamento.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

type Job = {
  name?: string;
  needs?: string[];
  strategy?: { "fail-fast"?: boolean; matrix?: Record<string, unknown> };
  steps?: Array<{ name?: string; run?: string; with?: Record<string, unknown> }>;
};

const CI = load(
  readFileSync(join(process.cwd(), ".github/workflows/ci.yml"), "utf8"),
) as { jobs: Record<string, Job> };

const e2e = CI.jobs.e2e!;

describe("E2E roda em shards paralelos", () => {
  it("declara 3 shards", () => {
    expect(e2e.strategy?.matrix?.shard).toEqual([1, 2, 3]);
  });

  it("passa --shard ao playwright (senão os 3 jobs rodam a suíte inteira)", () => {
    const run = e2e.steps?.find((s) => s.name?.includes("Rodar E2E"))?.run ?? "";
    expect(
      run,
      "sem `--shard` cada job rodaria os 180 testes: 3× o custo, 0 de ganho",
    ).toMatch(/--shard=\$\{\{ matrix\.shard \}\}\/3/);
  });

  it("um shard vermelho não cancela os outros", () => {
    expect(
      e2e.strategy?.["fail-fast"],
      "fail-fast: false — quero o quadro completo de falhas num run só, " +
        "não só a primeira que aparecer",
    ).toBe(false);
  });

  it("o relatório de falha é por shard (senão os 3 colidem no mesmo artefato)", () => {
    const upload = e2e.steps?.find((s) => s.name?.includes("Upload report"));
    expect(String(upload?.with?.name ?? "")).toMatch(/matrix\.shard/);
  });
});

describe("o sharding não muda o contrato do pipeline", () => {
  it("nenhum job depende do e2e — o deploy continua não bloqueado (ADR 0045/0046)", () => {
    const dependem = Object.entries(CI.jobs)
      .filter(([, j]) => (j.needs ?? []).includes("e2e"))
      .map(([nome]) => nome);

    expect(
      dependem,
      "matrix muda a semântica de `needs`: um job que dependesse do e2e passaria " +
        "a esperar os 3 shards. Hoje ninguém depende, e é assim que o full roda " +
        "em paralelo ao deploy sem travá-lo.",
    ).toEqual([]);
  });
});
