import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Trava de responsividade mobile (auditoria 2026-07-14).
 *
 * Impede a reintrodução de dois padrões que quebram o layout a 320px:
 *
 *  1. `grid-cols-{3..6}` SEM prefixo responsivo (`sm:`/`md:`/...). Um grid de 3+
 *     colunas fixo em 320px dá ~90px/coluna e esmaga rótulos/inputs/valores.
 *     Regra: base no mobile deve ser 1 ou 2 colunas; use `grid-cols-2 sm:grid-cols-3`.
 *
 *  2. `<table>` num arquivo SEM nenhum ancestral com `overflow-x-auto`/`overflow-auto`.
 *     Sem scroll horizontal, tabelas densas cortam colunas no mobile (WCAG 1.4.10).
 *
 * Exceção pontual: adicione `responsive-audit-ignore` na mesma linha ou na linha
 * de cima, com o motivo (ex.: valores curtos legíveis a 320px). Use com parcimônia.
 */

const ROOT = join(process.cwd(), "src");
const IGNORE_MARKER = "responsive-audit-ignore";

/** grid-cols-3..6 não precedido por `:` (exclui `sm:grid-cols-3` etc). */
const FIXED_GRID = /(?<!:)\bgrid-cols-[3-6]\b/;
/** Qualquer variante responsiva `sm:grid-cols-*` na mesma className. */
const RESPONSIVE_GRID = /:grid-cols-/;
const HAS_TABLE = /<table[\s>]/;
const HAS_X_SCROLL = /overflow-x-auto|overflow-auto/;

type Violation = { file: string; line: number; rule: string; detail: string };

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

/** True se a linha (ou a anterior) carrega o marcador de ignore. */
function isIgnored(lines: string[], index: number): boolean {
  return (
    lines[index]?.includes(IGNORE_MARKER) === true ||
    lines[index - 1]?.includes(IGNORE_MARKER) === true
  );
}

function checkFile(file: string): Violation[] {
  const rel = file.replace(`${process.cwd()}/`, "");
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  const violations: Violation[] = [];

  lines.forEach((line, i) => {
    // Só é problema quando NÃO há nenhum escalonamento responsivo na mesma
    // className: `grid-cols-3 sm:grid-cols-5` (base pequena p/ ícones/thumbs) é
    // deliberado; `grid-cols-3 gap-3` sem breakpoint é o code smell.
    if (FIXED_GRID.test(line) && !RESPONSIVE_GRID.test(line) && !isIgnored(lines, i)) {
      violations.push({
        file: rel,
        line: i + 1,
        rule: "grid-fixo",
        detail: "grid-cols-3+ sem breakpoint responsivo — use grid-cols-1/2 sm:grid-cols-N",
      });
    }
  });

  // Regra de tabela: nível de arquivo. Se há <table> e nenhum overflow-x no
  // arquivo, sinaliza a primeira <table> (a menos que marcada como ignore).
  if (HAS_TABLE.test(source) && !HAS_X_SCROLL.test(source)) {
    const tableLine = lines.findIndex((l) => HAS_TABLE.test(l));
    if (tableLine >= 0 && !isIgnored(lines, tableLine)) {
      violations.push({
        file: rel,
        line: tableLine + 1,
        rule: "tabela-sem-scroll",
        detail: "<table> sem ancestral overflow-x-auto — envolva num div com overflow-x-auto + min-w",
      });
    }
  }

  return violations;
}

const violations = walk(ROOT).flatMap(checkFile);

if (violations.length > 0) {
  console.error(
    `\n✗ Trava de responsividade: ${violations.length} ocorrência(s) que quebram o mobile a 320px:\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
    console.error(`      ${v.detail}`);
  }
  console.error(
    `\nCorrija o padrão, ou (se for realmente legível a 320px) adicione` +
      ` "${IGNORE_MARKER}" na linha com o motivo.\n`,
  );
  process.exit(1);
}

console.log("✓ Responsividade: nenhum grid fixo ou tabela sem scroll.");
