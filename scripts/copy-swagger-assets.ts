/**
 * Copia os assets do Swagger UI (CSS + bundle) de node_modules para public/, para
 * servi-los SAME-ORIGIN na página /docs/partner-api (sem CDN externo). Os arquivos
 * são gerados no build (não versionados) — sempre batem com a versão pinada de
 * `swagger-ui-dist` no package.json. Roda em `predev`/`prebuild`.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const distDir = dirname(require.resolve("swagger-ui-dist/swagger-ui.css"));
const OUT_DIR = "public/swagger-ui";
const FILES = ["swagger-ui.css", "swagger-ui-bundle.js"];

mkdirSync(OUT_DIR, { recursive: true });
for (const file of FILES) {
  copyFileSync(`${distDir}/${file}`, `${OUT_DIR}/${file}`);
}
console.log(`✓ Swagger UI assets copiados para ${OUT_DIR}/`);
