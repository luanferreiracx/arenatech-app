/**
 * VAR-4 (Etapa 9, fechamento): as 18 rotas de **detalhe** (`[id]`), que nenhuma
 * varredura anterior tinha medido.
 *
 * ## Por que ficaram para o fim
 *
 * Rota com parâmetro não renderiza sem um registro real. Medi-las exigiu criar
 * OS, serviço, fornecedor e venda avulsa no banco local — a alternativa era
 * medir tela de "não encontrado", que é a armadilha do M8 (medir o vazio).
 *
 * ## Resultado
 *
 * ```
 * rotas de detalhe medidas:  18
 * limpas:                    12
 * com achado:                 6
 * ```
 *
 * ## Os dois que rolavam a página
 *
 * ### `/pdv/[id]` — 30px, o pior caso das telas de detalhe
 *
 * O `title` do `PageHeader` era um `flex gap-3` sem quebra com botão de voltar +
 * ícone + `"Venda VND202603242"` + badge de status. O badge "Rascunho" terminava
 * em **350px** numa tela de 320.
 *
 * A mesma tela ainda tinha `min-w-[32rem]` (512px) na tabela de itens — valor
 * arbitrário que forçava 512px numa área de ~270. Com 4 colunas ela cabe sem
 * piso, e `Total` passou a vir antes do unitário.
 *
 * ### `/interests/[id]` — 1px
 *
 * `flex-row justify-between` sem quebra empurrava "Nova interação" para 321px.
 * Mesma classe do CMU-8 (M8).
 *
 * ## O checklist da OS
 *
 * `/service-orders/[id]/edit` cortava os rótulos do checklist de saída —
 * *"Aparelho liga"*, *"Aparelho vibra"*, *"Vidro traseiro"*. São itens que o
 * técnico **marca**: cortado, ele não sabe o que está confirmando.
 *
 * `grid-cols-2` já a 320px, com ícone + rótulo no mesmo botão. Uma coluna no
 * celular resolve.
 *
 * ## O que ficou registrado, não corrigido
 *
 * `/cashier/[id]` corta em 22px a descrição gerada pelo servidor
 * (`"Baixa parcela #1 - CR#493bd47d"`), numa célula com `whitespace-nowrap`
 * dentro de tabela com scroll. Ainda se lê *"Baixa parcela #1 - C…"* — a
 * informação que identifica o movimento está visível. Encurtar exigiria mudar o
 * texto que o servidor gera, o que é decisão de produto.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const VENDA = ler("src/app/(app)/pdv/[id]/_components/sale-detail.tsx");
const INTERESSE = ler("src/app/(app)/interests/[id]/page.tsx");
const OS_EDIT = ler("src/app/(app)/service-orders/[id]/edit/page.tsx");

describe("VAR-4 — o detalhe da venda não rola a página", () => {
  it("o cabeçalho quebra em vez de empurrar", () => {
    const i = VENDA.indexOf("Voltar para historico de vendas");
    expect(i).toBeGreaterThan(0);
    const container = VENDA.lastIndexOf('<div className="flex', i);
    expect(
      VENDA.slice(container, container + 90),
      "botão + ícone + número da venda + badge não cabem em 320px sem quebra: " +
        'o badge "Rascunho" terminava em 350px e a página rolava 30px.',
    ).toMatch(/flex-wrap/);
  });

  it("a tabela de itens não tem largura mínima arbitrária", () => {
    // `min-w-[32rem]` = 512px forçados numa área de ~270. Valor arbitrário,
    // proibido pelo padrão do projeto, e desnecessário com 4 colunas.
    //
    // Mira o `className`, não o texto: a primeira ocorrência da string é o
    // COMENTÁRIO que explica a remoção — quarta vez que essa armadilha aparece
    // na Etapa 9 (M7, M13, M17, aqui).
    expect(VENDA).not.toMatch(/className="[^"]*min-w-\[32rem\]/);
  });

  it("Total vem antes do preço unitário", () => {
    const cabecalhos = [...VENDA.matchAll(/^\s{16,18}(Produto|Total|Qtd|Preco Unit\.)$/gm)].map((m) => m[1]);
    expect(cabecalhos.slice(0, 2)).toEqual(["Produto", "Total"]);
  });
});

describe("VAR-4 — o detalhe do interesse não rola a página", () => {
  it("o cabeçalho do card de interações quebra", () => {
    const i = INTERESSE.indexOf("Interações</CardTitle>");
    expect(i).toBeGreaterThan(0);
    const header = INTERESSE.lastIndexOf("<CardHeader", i);
    expect(
      INTERESSE.slice(header, i),
      '"Nova interação" era empurrado para 321px numa tela de 320.',
    ).toMatch(/flex-wrap/);
  });
});

describe("VAR-4 — o checklist da OS é legível", () => {
  it("uma coluna no celular, duas a partir de 420px", () => {
    // Ancora na CHAMADA dentro do onClick, não na primeira ocorrência do nome —
    // que é a DEFINIÇÃO da função, 200 linhas antes do grid.
    const i = OS_EDIT.indexOf("cycleChecklistValue(prev[key])");
    expect(i).toBeGreaterThan(0);
    const grid = OS_EDIT.lastIndexOf('<div className="grid', i);
    const trecho = OS_EDIT.slice(grid, grid + 150);
    expect(
      trecho,
      'os rótulos ("Aparelho liga", "Aparelho vibra") são o que o técnico MARCA — ' +
        "cortados, ele não sabe o que está confirmando.",
    ).toMatch(/grid-cols-1/);
    expect(trecho).toMatch(/min-\[420px\]:grid-cols-2/);
  });
});
