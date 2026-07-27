/**
 * Guardião da configuração do build da imagem (incidente 2026-07-27).
 *
 * Os deploys ficaram travados por horas porque o job "Build & push Docker image"
 * morria sempre — aparecendo como `cancelled`, que no GitHub Actions é como o
 * TIMEOUT é reportado.
 *
 * Causa raiz: `docker/setup-buildx-action` sem `driver` cria um builder
 * `docker-container` NOVO a cada run, que nasce SEM cache. O Dockerfile depende
 * de `--mount=type=cache` (pnpm store e `.next/cache`), que vive DENTRO do
 * builder — `cache-from/to` externo (`type=gha` ou `type=local`) NÃO cobre esses
 * mounts. Builder novo ⇒ `next build` do zero toda vez (631s medidos na VPS).
 *
 * Este teste existe porque a correção é **contra-intuitiva**: parece "melhor"
 * usar o driver padrão e um cache explícito, e é exatamente isso que quebra.
 * Comentário no YAML e nota no CLAUDE.md dependem de alguém ler; isto falha no
 * CI sozinho.
 *
 * Se um dia o projeto precisar de build multi-arch, o driver `docker` não serve
 * — aí a troca é legítima: ajuste este teste E suba o `timeout-minutes` junto,
 * porque o build volta a ser cold.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ci = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");

/** Recorta o bloco do job `build-image` (até o começo do próximo job). */
function buildImageJob(): string {
  const start = ci.indexOf("\n  build-image:");
  expect(start).toBeGreaterThan(-1);
  const rest = ci.slice(start + 1);
  const next = rest.search(/\n {2}[a-z0-9-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("config do build da imagem — não regredir o builder", () => {
  it("usa o builder do daemon (`driver: docker`), não um container efêmero", () => {
    const job = buildImageJob();
    expect(job).toMatch(/setup-buildx-action/);
    // Sem esta linha, o builder nasce sem cache e o next build refaz do zero.
    expect(job).toMatch(/driver:\s*docker\b/);
  });

  it("não usa cache remoto `type=gha` (runner é self-hosted)", () => {
    const job = buildImageJob();
    expect(job).not.toMatch(/cache-(from|to):\s*type=gha/);
  });

  it("tem folga de timeout para o build cold (>= 20min)", () => {
    const job = buildImageJob();
    const m = job.match(/timeout-minutes:\s*(\d+)/);
    expect(m, "build-image precisa declarar timeout-minutes").not.toBeNull();
    // `next build` sozinho leva 631s a frio na VPS; 12min matava o job.
    expect(Number(m![1])).toBeGreaterThanOrEqual(20);
  });

  it("build-image depende de typecheck (o Dockerfile pula a checagem confiando nisso)", () => {
    // O Dockerfile define DOCKER_BUILD_SKIP_CHECKS=1 para o `next build` não
    // refazer o typecheck dentro do container (9,4min medidos na VPS). Isso só
    // é seguro porque `tsc --noEmit` já rodou como PRÉ-REQUISITO deste job.
    // Se alguém tirar `typecheck` do `needs`, a imagem passa a poder ser
    // buildada com erro de tipo — e aí o skip vira um buraco.
    const job = buildImageJob();
    expect(job).toMatch(/needs:\s*\[[^\]]*typecheck[^\]]*\]/);

    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    expect(dockerfile).toMatch(/DOCKER_BUILD_SKIP_CHECKS=1/);
  });

  it("push na main não se auto-cancela (cada merge precisa deployar)", () => {
    // Foi a primeira hipótese errada do incidente: "os merges se cancelam".
    // Mantém explícito que a main está fora do cancel-in-progress.
    expect(ci).toMatch(/cancel-in-progress:\s*\$\{\{\s*github\.ref\s*!=\s*'refs\/heads\/main'\s*\}\}/);
  });
});
