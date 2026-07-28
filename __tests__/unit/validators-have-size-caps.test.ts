/**
 * Guardião do item 24 da auditoria 2026-07-25: campo de texto sem teto.
 *
 * 505 das 542 colunas de texto do schema são `TEXT` puro — o Postgres aceita
 * até 1GB por valor. Um `z.string()` sem `.max()` sobre uma dessas colunas é
 * armazenamento gratuito para quem tiver sessão válida. Medido em 2026-07-28:
 * `customers.notes` engoliu 20 MB numa requisição, em 185ms.
 *
 * Este teste impede a volta do padrão. Um `z.string()` novo sem teto quebra o
 * build — o autor escolhe uma constante de `validators/limits.ts` ou justifica
 * a exceção na allowlist abaixo.
 *
 * Não conta como sem-teto o que JÁ é limitado por construção: `.uuid()` (36),
 * `.email()`, `.url()`, `.regex()`, `.length()`, `.ip()`, `.datetime()`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZES = [
  join(process.cwd(), "src", "lib", "validators"),
  join(process.cwd(), "src", "server", "api", "routers"),
  join(process.cwd(), "src", "server", "services"),
];

/** Refinamentos que já limitam o tamanho — não precisam de `.max()`. */
const JA_LIMITADO = /\.(uuid|email|datetime|url|regex|ip|emoji|nanoid|ulid|cuid2?|length)\(/;

/** `campo: z.string()...` numa linha só. */
const CAMPO = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(z\.string\(\).*)$/;

/**
 * Exceções conscientes. Formato: "arquivo:campo" → motivo.
 * Vazia por ora — se você precisar adicionar, explique POR QUE aquele campo
 * pode receber texto ilimitado.
 */
const ALLOWLIST = new Map<string, string>();

function arquivosTs(dir: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) saida.push(...arquivosTs(p));
    else if (entrada.endsWith(".ts")) saida.push(p);
  }
  return saida;
}

describe("validadores têm teto de tamanho", () => {
  it("nenhum z.string() de texto livre fica sem .max()", () => {
    const infratores: string[] = [];

    for (const raiz of RAIZES) {
      for (const arquivo of arquivosTs(raiz)) {
        const relativo = arquivo.slice(process.cwd().length + 1);
        const linhas = readFileSync(arquivo, "utf8").split("\n");

        linhas.forEach((linha, i) => {
          const m = CAMPO.exec(linha);
          if (!m) return;
          const campo = m[1] ?? "";
          const expr = m[2] ?? "";
          if (expr.includes(".max(") || JA_LIMITADO.test(expr)) return;
          if (ALLOWLIST.has(`${relativo}:${campo}`)) return;
          infratores.push(`${relativo}:${i + 1} — ${campo}`);
        });
      }
    }

    expect(infratores).toEqual([]);
  });
});
