/**
 * CMU-8/9/10 (Etapa 9, Módulo 8 — Comissões): a ficha do prestador rolava
 * horizontalmente a 320px e escondia justamente os números.
 *
 * ## Três defeitos, uma raiz
 *
 * | id | o quê | medido a 320px |
 * |---|---|---|
 * | CMU-8 | botões com rótulo longo | "Fechar apuracao e gerar conta a pagar" terminava em **333px**; "Marcar/Desmarcar" em **389px** |
 * | CMU-9 | coluna do valor por último | alíquotas: coluna "Valor" começava em **356px** de 238 visíveis; memória: "Comissao" em **474px** |
 * | CMU-10 | `grid-cols-2` fixo | "+R$ 1.000,00" pedia 158px numa caixa de **96** — transbordava 62px sobre o cartão vizinho |
 *
 * O CMU-9 é o mais traiçoeiro porque **não viola a WCAG 1.4.10**: as tabelas
 * ficam em `overflow-x-auto`, e scroll dentro de container é estratégia válida
 * para dado tabular. Só que a tabela media 362px num cartão de 238, e o que
 * sobrava fora da vista era a alíquota. O operador via `R$` solto em três
 * linhas e concluía que não havia alíquota cadastrada — os 5%/10%/7% estavam no
 * DOM, nunca na tela. Norma cumprida, informação perdida.
 *
 * ## O que este teste afirma
 *
 * A **classe**: nas tabelas de dinheiro deste módulo, a coluna do valor não é a
 * última de seis; e os rótulos longos podem quebrar. Medir pixel exige
 * navegador — isto aqui guarda a decisão estrutural que a medição validou.
 *
 * ## Duas medições erradas antes da certa
 *
 * 1. Medi o **mês corrente** (agosto), que não tem apuração. Sem apuração não
 *    existe botão "Fechar" nem memória de cálculo: a tela passava limpa e dois
 *    dos três defeitos ficavam invisíveis. É a armadilha do banco vazio do CI,
 *    aqui na forma de *mês* vazio.
 * 2. Comparei a tela (banco local) contra o banco de **produção** e quase
 *    escrevi um achado de R$ 1.078 de divergência. Era cópia local defasada:
 *    julho fora recalculado em prod dois dias antes. As três provas exigem que
 *    tela e banco venham da MESMA fonte.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DETALHE = readFileSync(
  join(
    process.cwd(),
    "src/app/(app)/commissions/providers/[id]/_components/provider-detail.tsx",
  ),
  "utf8",
);
const EDITOR = readFileSync(
  join(
    process.cwd(),
    "src/app/(app)/commissions/providers/[id]/_components/contract-rules-editor.tsx",
  ),
  "utf8",
);

/** Cabeçalhos de cada `<thead>` do arquivo, na ordem em que aparecem. */
function colunasPorTabela(fonte: string): string[][] {
  return [...fonte.matchAll(/<thead>([\s\S]*?)<\/thead>/g)].map((m) =>
    [...(m[1] ?? "").matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((t) => (t[1] ?? "").trim()),
  );
}

describe("CMU-9 — a coluna do valor cabe na tela", () => {
  const tabelas = colunasPorTabela(DETALHE);

  it("encontra as três tabelas do módulo", () => {
    expect(tabelas.length).toBeGreaterThanOrEqual(3);
  });

  for (const rotulo of ["Valor", "Comissao"]) {
    it(`"${rotulo}" nunca é a última de seis colunas`, () => {
      const infratoras = tabelas.filter(
        (cols) => cols.length >= 6 && cols[cols.length - 1] === rotulo,
      );
      expect(
        infratoras.map((c) => c.join("|")),
        `com 6 colunas a tabela mede ~362-507px num cartão de 238: a última ` +
          `coluna nasce fora da vista. Se é o VALOR que fica fora, a tela ` +
          `informa o oposto do que o dado diz — o operador vê "R$" vazio e ` +
          `conclui que não há alíquota. Ponha o valor logo após a primeira coluna.`,
      ).toEqual([]);
    });
  }

  it("nas tabelas de 6 colunas, o valor está entre as duas primeiras", () => {
    const largas = tabelas.filter((c) => c.length >= 6);
    expect(largas.length).toBeGreaterThan(0);
    for (const cols of largas) {
      const i = cols.findIndex((c) => c === "Valor" || c === "Comissao");
      expect(i, `tabela ${cols.join("|")} sem coluna de valor identificável`).toBeGreaterThanOrEqual(0);
      expect(i, `em ${cols.join("|")} o valor está na posição ${i + 1}`).toBeLessThanOrEqual(1);
    }
  });
});

describe("CMU-8 — rótulo longo quebra em vez de empurrar a página", () => {
  /**
   * O `Button` base traz `shrink-0` + `whitespace-nowrap`: ótimo para rótulo
   * curto, fatal para 37 caracteres. Estes dois precisam poder quebrar.
   */
  const BOTOES_LONGOS: Array<[string, string]> = [
    ["Fechar apuracao e gerar conta a pagar", DETALHE],
    ["contrato e aliquotas", EDITOR],
  ];

  for (const [rotulo, fonte] of BOTOES_LONGOS) {
    it(`"${rotulo}" pode encolher e quebrar`, () => {
      const i = fonte.indexOf(rotulo);
      expect(i, `rótulo "${rotulo}" não encontrado`).toBeGreaterThan(0);
      // O `className` fica ANTES do rótulo, no `<Button>` que o envolve.
      const abertura = fonte.lastIndexOf("<Button", i);
      const trecho = fonte.slice(abertura, i);
      expect(
        trecho,
        `sem "whitespace-normal" o rótulo vira uma linha irredutível de ~300px ` +
          `e empurra a página inteira a 320px (medido: 333px e 389px).`,
      ).toMatch(/whitespace-normal/);
      expect(trecho).toMatch(/\bshrink\b/);
    });
  }
});

describe("CMU-10 — cartão de resumo não transborda", () => {
  it("o grid começa em uma coluna e os filhos podem encolher", () => {
    // `grid-cols-2` a 320px dá 96px de caixa para `text-2xl`; "+R$ 1.000,00"
    // pede 158px. Sem `min-w-0` o filho de grid não encolhe abaixo do conteúdo.
    const i = DETALHE.indexOf("Comissao bruta");
    const grid = DETALHE.lastIndexOf("<div className=\"grid", i);
    const trecho = DETALHE.slice(grid, grid + 160);
    expect(trecho).toMatch(/grid-cols-1/);
    expect(trecho).toMatch(/\[&>\*\]:min-w-0/);
  });
});

describe("a linha de ações dos dias não cobertos quebra", () => {
  it("usa flex-wrap", () => {
    // Última das quatro linhas de ação do arquivo sem ponto de quebra — as
    // outras três ganharam no CMU-4. O irmão esquecido.
    const i = DETALHE.indexOf("Dia de remoto");
    const div = DETALHE.lastIndexOf('<div className="flex', i);
    expect(DETALHE.slice(div, div + 90)).toMatch(/flex-wrap/);
  });
});
