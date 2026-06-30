/**
 * Gera (ou verifica) o OpenAPI da API de parceiros a partir dos schemas Zod.
 *
 *   pnpm openapi:gen     → escreve docs/openapi/partner-api.yaml
 *   pnpm openapi:check   → falha (exit 1) se o arquivo commitado estiver desatualizado
 *
 * O `check` roda no CI: mexeu na API (schema/rota) sem regenerar → build vermelho.
 * É a TRAVA que mantém a doc amarrada ao código.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import yaml from "js-yaml";
import { buildOpenApiSpec } from "../src/lib/partner-api/openapi-spec";

const OUT = "docs/openapi/partner-api.yaml";

function render(): string {
  const spec = buildOpenApiSpec();
  return (
    "# GERADO AUTOMATICAMENTE a partir dos schemas Zod (scripts/gen-partner-openapi.ts).\n" +
    "# NÃO editar à mão — rode `pnpm openapi:gen`. O CI (`openapi:check`) trava divergência.\n" +
    yaml.dump(spec, { lineWidth: 100, noRefs: true, sortKeys: false })
  );
}

const mode = process.argv[2] === "--check" ? "check" : "gen";
const next = render();

if (mode === "check") {
  if (!existsSync(OUT)) {
    console.error(`✗ ${OUT} não existe. Rode \`pnpm openapi:gen\` e commite.`);
    process.exit(1);
  }
  const current = readFileSync(OUT, "utf8");
  if (current !== next) {
    console.error(
      `✗ ${OUT} está desatualizado em relação aos schemas Zod.\n` +
        "  A API mudou mas a spec não foi regenerada. Rode `pnpm openapi:gen` e commite.",
    );
    process.exit(1);
  }
  console.log(`✓ ${OUT} está em sincronia com os schemas.`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, next);
  console.log(`✓ Spec gerada em ${OUT}`);
}
