/**
 * Finalização — Módulo 15, AD-1: leitura pública de OS/orçamento tem teto.
 *
 * `byPublicLink` e `getQuoteByLink` são `publicProcedure` — anônimas — e rodam em
 * `withAdmin`, ou seja, **com o RLS desligado**. O controle de acesso é o segredo
 * do link.
 *
 * A entropia sustenta isso: `generatePublicToken` usa `crypto.randomBytes` sobre
 * base32-crockford, 12 chars ≈ 60 bits. Mas medindo a produção apareceram **2 OS
 * com link de 7 caracteres** (≈35 bits), criadas em 22/05/2026 — nenhum gerador
 * do código produz 7, então vieram de backfill. Para elas, e para qualquer
 * martelada, o teto de tentativas é a segunda camada.
 *
 * `respondToQuote` (a mutation logo abaixo) já tinha limite; as LEITURAS ficaram
 * de fora. Este teste guarda o par — se alguém remover o middleware de uma delas,
 * ele cai.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FONTE = readFileSync(
  join(process.cwd(), "src/server/api/routers/service-order.ts"),
  "utf8",
);

/** Trecho da procedure, do nome até o `.input(` — onde o `.use()` mora. */
function cabecalhoDaProcedure(nome: string): string {
  const inicio = FONTE.indexOf(`  ${nome}: publicProcedure`);
  expect(inicio, `procedure ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = FONTE.indexOf(".input(", inicio);
  return FONTE.slice(inicio, fim);
}

describe("AD-1 — leituras públicas de OS têm teto de tentativas", () => {
  for (const nome of ["byPublicLink", "getQuoteByLink"]) {
    it(`${nome} aplica rateLimitMiddleware`, () => {
      expect(cabecalhoDaProcedure(nome)).toContain("rateLimitMiddleware");
    });
  }

  it("a mutation de resposta ao orçamento segue com o seu limite", () => {
    // Ela já tinha; o teste existe para o limite não sumir junto numa refatoração.
    expect(cabecalhoDaProcedure("respondToQuote")).toContain("rateLimitMiddleware");
  });

  it("toda publicProcedure deste router tem teto", () => {
    // Guardião de cobertura: procedure pública nova nasce com limite ou o teste cai.
    const semTeto: string[] = [];
    const re = /^ {2}(\w+): publicProcedure/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(FONTE)) !== null) {
      if (!cabecalhoDaProcedure(m[1]!).includes("rateLimitMiddleware")) semTeto.push(m[1]!);
    }
    expect(semTeto).toEqual([]);
  });
});
