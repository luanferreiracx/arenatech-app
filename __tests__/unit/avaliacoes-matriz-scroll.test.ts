/**
 * AVL-1 (Etapa 9, Módulo 13 — Avaliações): a matriz de preços escondia os
 * valores à direita sem nenhuma pista de que existiam.
 *
 * ## Medido a 320px, com o pior caso REAL de produção
 *
 * A tela é uma matriz por modelo: bateria nas linhas, capacidade nas colunas.
 * Produção tem um "Playstation 5 Slim" com **4 capacidades**, e os rótulos são
 * longos ("825GB - COM DISCO"):
 *
 * ```
 * tabela  533px   área visível  270px   ->  3 dos 4 preços fora da vista
 * ```
 *
 * O operador via um preço e não tinha como saber que havia mais três — a tabela
 * simplesmente some na borda do cartão.
 *
 * ## O que NÃO era a causa
 *
 * O primeiro palpite foi o `min-w-[110px]` fixo por coluna (valor arbitrário,
 * proibido pelo padrão do projeto). Trocá-lo por `w-auto` levou a tabela de
 * 533px para **506px** — 3 preços continuavam fora.
 *
 * O limite é o **conteúdo**: "825GB - COM DISCO" precisa de 103px, e
 * 4 × 103 + 93 (coluna Bateria) = 506px. Espremer mais tornaria o rótulo
 * ilegível — trocaria um defeito por outro.
 *
 * ## A correção
 *
 * Scroll horizontal é estratégia **válida** da WCAG 1.4.10 para dado tabular, a
 * matriz é o formato certo para este dado, e a coluna Bateria já era sticky. O
 * que faltava era o operador **saber** que há mais à direita.
 *
 * O aviso vive **fora** do `overflow-x-auto` — dentro dele rolaria junto com a
 * tabela e sumiria com ela.
 *
 * ## O limiar: `> 1`, não `> 2`
 *
 * Meu primeiro palpite foi avisar a partir de 3 capacidades. A medição mostrou
 * que **já com DUAS** a tabela transborda (285-299px numa área de 270) e esconde
 * o segundo preço — o palpite deixava **3 dos 5 modelos sem aviso**, justamente
 * os casos mais comuns.
 *
 * Verificado depois: **4 tabelas transbordam, 4 avisos**. A de 1 capacidade
 * (única que cabe) não tem aviso.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LISTA = readFileSync(
  join(process.cwd(), "src/app/(app)/valuations/_components/valuations-list.tsx"),
  "utf8",
);

describe("AVL-1 — a matriz avisa que há preços fora da vista", () => {
  it("mostra o aviso de arrastar", () => {
    expect(LISTA).toMatch(/Arraste a tabela para ver as \{group\.storageOptions\.length\} capacidades/);
  });

  it("o limiar é 1 — com duas capacidades a tabela já transborda", () => {
    expect(
      LISTA,
      "medido a 320px: 2 capacidades = 285-299px numa área de 270, escondendo " +
        "o segundo preço. `> 2` deixaria 3 dos 5 modelos sem aviso.",
    ).toMatch(/group\.storageOptions\.length > 1/);
    expect(LISTA).not.toMatch(/group\.storageOptions\.length > 2/);
  });

  it("o aviso fica FORA do container que rola", () => {
    // Dentro do `overflow-x-auto` ele rolaria junto com a tabela e sumiria com
    // ela — o aviso some justamente quando é necessário.
    const posAviso = LISTA.indexOf("Arraste a tabela");
    const posFimScroller = LISTA.indexOf("</table>");
    const posFechaDiv = LISTA.indexOf("</div>", posFimScroller);
    expect(posAviso).toBeGreaterThan(posFechaDiv);
  });

  it("só aparece onde falta espaço", () => {
    // No desktop a matriz cabe; o aviso seria ruído.
    const i = LISTA.indexOf("Arraste a tabela");
    expect(LISTA.slice(Math.max(0, i - 300), i)).toMatch(/sm:hidden/);
  });

  it("não aparece com o cartão recolhido", () => {
    // Sem tabela visível, "arraste a tabela" não faz sentido.
    const i = LISTA.indexOf("Arraste a tabela");
    expect(LISTA.slice(Math.max(0, i - 400), i)).toMatch(/!collapsed/);
  });
});

describe("a coluna de capacidade não usa largura arbitrária", () => {
  it("dimensiona pelo conteúdo", () => {
    // `min-w-[110px]` é valor arbitrário (proibido) e forçava 4 × 110 mesmo
    // quando o rótulo cabia em menos.
    //
    // Mira o `className`, não o texto solto: a primeira versão deste detector
    // acusou o próprio COMENTÁRIO que cita o valor removido — a mesma armadilha
    // do guardião do M7.
    expect(LISTA).not.toMatch(/className="[^"]*min-w-\[110px\]/);
    expect(LISTA).toMatch(/className="w-auto px-2/);
  });

  it("a coluna Bateria continua sticky", () => {
    // É o que mantém a referência de linha ao rolar na horizontal — sem ela o
    // operador perde de vista a qual faixa de bateria o preço pertence.
    //
    // Ancora no `<th>`, não em "Bateria": a primeira ocorrência da palavra é o
    // campo `saudeBateria` do tipo, 150 linhas antes da tabela.
    const i = LISTA.indexOf("<th className=\"sticky left-0");
    expect(i, "cabeçalho sticky não encontrado").toBeGreaterThan(0);
    expect(LISTA.slice(i, i + 400)).toMatch(/Bateria/);
  });
});
