/**
 * M9-3 (Etapa 7, Módulo 9 — Financeiro): a ADR 0032 diz "operador vê só
 * RECEIVABLE". O `getById` negava com FORBIDDEN; o `list` **trocava o filtro em
 * silêncio** (`role === "operator" ? "RECEIVABLE" : input.type`).
 *
 * Efeito medido no navegador, com um operador real: a tela "Contas a Pagar"
 * abria e mostrava
 *
 *     R$ 49.599,99
 *     8 conta(s)
 *     Contas a Pagar
 *
 * ...com dados de contas a **receber**. Produção tem 3 PAYABLE pendentes
 * (R$ 13.850) e 73 RECEIVABLE (R$ 109.449) — nem a contagem nem o valor batiam
 * com o rótulo.
 *
 * Trocar o dado sob um rótulo errado não protege ninguém e desinforma o
 * operador, que passa a acreditar que a loja deve R$ 49,6 mil. Negar é o que o
 * irmão já fazia.
 *
 * O teste afirma a REGRA nos dois resolvers, para que a próxima divergência não
 * passe: **operador pedindo PAYABLE recebe recusa, não outro dado.**
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/financial.ts"),
  "utf8",
);

const NAV = readFileSync(
  join(process.cwd(), "src/components/layout/nav-items.ts"),
  "utf8",
);

/**
 * Recorta o corpo de uma procedure pelo nome, para que a asserção fale do
 * resolver certo. Uma busca no arquivo inteiro passaria por causa do `getById`,
 * que já negava — foi exatamente assim que a primeira versão deste teste
 * passou cega contra o código defeituoso.
 */
function corpoDaProcedure(nome: string): string {
  const inicio = ROUTER.indexOf(`  ${nome}: tenantProcedure`);
  if (inicio < 0) throw new Error(`procedure ${nome} não encontrada`);
  const proxima = ROUTER.slice(inicio + 10).search(/\n {2}\w+: (?:tenant|admin)Procedure/);
  return proxima < 0 ? ROUTER.slice(inicio) : ROUTER.slice(inicio, inicio + 10 + proxima);
}

describe("M9-3 — operador pedindo PAYABLE recebe recusa, não outro dado", () => {
  it("`list` nega explicitamente em vez de só trocar o filtro", () => {
    const list = corpoDaProcedure("list");

    expect(
      list,
      "`list` precisa negar PAYABLE ao operador (FORBIDDEN), como o `getById` já " +
        "faz. Trocar o filtro em silêncio devolve RECEIVABLE sob o rótulo " +
        "'Contas a Pagar' — desinforma em vez de proteger.",
    ).toMatch(/role === "operator" && input\.type === "PAYABLE"/);
  });

  it("a recusa do `list` usa FORBIDDEN, não um retorno vazio", () => {
    const list = corpoDaProcedure("list");
    const i = list.indexOf('input.type === "PAYABLE"');
    expect(list.slice(i, i + 300)).toMatch(/FORBIDDEN/);
  });

  it("`getById` continua negando (a regra vale nos dois)", () => {
    expect(corpoDaProcedure("getById")).toMatch(/FORBIDDEN/);
  });

  it("o menu não oferece uma tela que o backend recusa", () => {
    const linha = NAV.split("\n").find((l) => l.includes('href: "/financial?type=PAYABLE"'));
    expect(linha, "item 'Contas a Pagar' sumiu do menu — atualize este teste").toBeDefined();
    expect(
      linha,
      "'Contas a Pagar' precisa de `adminOnly: true`: o resolver nega PAYABLE ao " +
        "operador, então o menu não deve levá-lo até lá.",
    ).toMatch(/adminOnly:\s*true/);
  });
});
