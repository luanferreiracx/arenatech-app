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

/**
 * Guardião do upload de source map.
 *
 * Enquanto ele esteve desligado, todo erro de browser chegava ao Sentry com o
 * stack 100% minificado — sem arquivo, sem linha, sem component stack do React.
 * A maior issue tinha 186 eventos em duas semanas e não dizia onde quebrou.
 *
 * São quatro peças e a corrente arrebenta em qualquer elo: o binário do
 * sentry-cli precisa poder ser baixado, o token precisa chegar ao build, o
 * build precisa recebê-lo como secret (não como camada) e o withSentryConfig
 * precisa estar com o upload ligado. Cada teste abaixo trava um elo.
 */
describe("upload de source map do Sentry", () => {
  const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");

  it("o postinstall do @sentry/cli é permitido (senão não há binário pra subir mapa)", () => {
    const workspace = readFileSync(join(process.cwd(), "pnpm-workspace.yaml"), "utf8");
    expect(workspace).toMatch(/'@sentry\/cli':\s*true/);
    expect(dockerfile).toMatch(/approve-builds[^\n]*@sentry\/cli/);
  });

  it("o token vai como secret do BuildKit, nunca como ARG/ENV", () => {
    // ARG/ENV ficariam gravados no histórico da imagem — qualquer um com acesso
    // ao registry leria o token com `docker history`.
    expect(dockerfile).toMatch(/--mount=type=secret,id=sentry_auth_token/);
    expect(dockerfile).not.toMatch(/^\s*(ARG|ENV)\s+SENTRY_AUTH_TOKEN/m);
    expect(buildImageJob()).toMatch(/secrets:[\s\S]*sentry_auth_token=\$\{\{\s*secrets\.SENTRY_AUTH_TOKEN\s*\}\}/);
  });

  it("o withSentryConfig sobe o mapa quando há token, e não publica o mapa junto", () => {
    const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    // `disable` amarrado à ausência do token: com token sobe, sem token o build
    // local segue funcionando.
    expect(nextConfig).toMatch(/disable:\s*!sentryAuthToken/);
    expect(nextConfig).toMatch(/deleteSourcemapsAfterUpload:\s*true/);
    expect(nextConfig).toMatch(/org:\s*"pdv-depix"/);
    expect(nextConfig).toMatch(/project:\s*"javascript-nextjs"/);
  });
});

/**
 * Guardião dos testes de integração no CI.
 *
 * Eles rodavam SÓ na máquina de quem lembrasse: o job de unit usa
 * `--exclude="**‍/integration/**"` e nenhum outro job os chamava. São 365 testes
 * contra banco real, e entre eles os que guardam DINHEIRO — idempotência da
 * renovação DePix (webhook duplicado não credita 2×), lost-update de parcela,
 * CAS de fechamento de comissão, isolamento de RLS.
 *
 * O custo de não rodar já apareceu: um teste com data absoluta ("2026-08-01"
 * tratado como futuro) virou vermelho sozinho quando a data chegou, e ninguém
 * viu — foi encontrado à mão, dias depois, durante uma auditoria.
 */
describe("CI roda os testes de integração", () => {
  it("existe um job dedicado que os executa", () => {
    expect(ci).toContain("integration-test:");
    expect(ci).toMatch(/pnpm vitest run __tests__\/integration/);
  });

  it("usa --no-file-parallelism (os testes compartilham o banco)", () => {
    // Sem isto, um arquivo enxerga o fixture do outro. Medido: falso vermelho em
    // subscription-dunning quando roda junto de rls.
    const job = ci.slice(ci.indexOf("integration-test:"));
    expect(job).toMatch(/__tests__\/integration --no-file-parallelism/);
  });

  it("sobe banco próprio e roda migrate + seed antes (banco limpo do zero)", () => {
    const job = ci.slice(ci.indexOf("integration-test:"), ci.indexOf("lwk-test:"));
    expect(job).toContain("prisma migrate deploy");
    expect(job).toContain("prisma/seed.ts");
    expect(job).toContain("image: postgres:16");
  });

  it("não compartilha a porta do banco do job de unit", () => {
    // Dois jobs no mesmo runner-pool com a mesma porta se atropelariam.
    const unit = ci.slice(ci.indexOf("  test:"), ci.indexOf("integration-test:"));
    const integration = ci.slice(ci.indexOf("integration-test:"), ci.indexOf("lwk-test:"));
    expect(unit).toContain("5435:5432");
    expect(integration).toContain("5436:5432");
  });
});

/**
 * Guardião do `DATABASE_URL` nos testes.
 *
 * `test.env` do Vitest SOBRESCREVE o ambiente do processo. Com um literal ali, o
 * `DATABASE_URL` que o CI define era descartado e as 101 suítes de integração
 * falavam com um banco inexistente no runner — todas caíam com erro de conexão
 * do Prisma, e o log do GitHub trunca a mensagem, o que faz o sintoma parecer
 * "os testes quebraram" em vez de "não há banco".
 *
 * O literal continua lá como fallback, para `pnpm vitest` funcionar sem preâmbulo
 * na máquina de quem desenvolve. O que não pode voltar é ele ser incondicional.
 */
describe("vitest respeita o DATABASE_URL do ambiente", () => {
  const vitestConfig = readFileSync(join(process.cwd(), "vitest.config.ts"), "utf8");

  it("usa o env do processo antes do literal local", () => {
    expect(vitestConfig).toMatch(/DATABASE_URL:\s*\n?\s*process\.env\.DATABASE_URL\s*\?\?/);
  });

  it("mantém o fallback local (não exige env para rodar na máquina do dev)", () => {
    expect(vitestConfig).toContain("localhost:5432/arenatech");
  });
});
