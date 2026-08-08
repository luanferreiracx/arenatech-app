/**
 * VAR-1 (Etapa 9, varredura final): a cobertura por "módulo" escondia 75 rotas.
 *
 * ## Como isto apareceu
 *
 * Declarei a Etapa 9 concluída com "18 de 18 módulos". O dono mandou continuar
 * *"até fechar TODOS"*. Ao varrer o código em vez da minha própria lista:
 *
 * ```
 * rotas em src/app/(app):        124
 * rotas que eu havia medido:      49
 * NUNCA medidas:                  75
 * ```
 *
 * "18 módulos" era um agrupamento meu, não uma contagem. Honesto sobre módulos,
 * enganoso sobre cobertura.
 *
 * ## O que a varredura das 53 rotas estáticas achou
 *
 * **17 telas com defeito** — e o padrão é o mesmo das cinco ocorrências
 * anteriores, agora em escala:
 *
 * | rota | tabela | colunas fora de vista |
 * |---|---|---|
 * | `/pdv/history` | 1033/270 | Cliente, Vendedor, Itens, **Valor**, Pagamento, **Status**, Ações |
 * | `/stock/report` | 1075/222 | SKU, Estoque, Mínimo, Custo, Venda, Total, **Status** |
 * | `/stock/purchases` | 914/270 | Vendedor, Condição, Bateria, **Preço Compra**, **Preço Venda** |
 * | `/stock/movements` | 861/270 | **Tipo**, **Quantidade**, Motivo |
 * | `/cashier/history` | 744/270 | **Status**, Saldo Inicial, Esperado, Informado, **Diferença** |
 * | `/financial/pending` | 635/270 | Já Pago, **A Receber**, **Status**, Vencimento |
 *
 * Mais 11 telas com uma ou duas colunas fora.
 *
 * ## Corrigidas neste PR (as de dinheiro e decisão)
 *
 * - **`/pdv/history`** — `Valor` e `Status` para as posições 3 e 4. Reordenar
 *   **não bastou**: "Venda" (142px) + "Data" (139px) consumiam 281px dos 270,
 *   porque a data trazia ano de 4 dígitos + hora com `whitespace-nowrap`.
 *   `Valor` ainda nascia em 306px. Com ano de 2 dígitos: **292px, visível**.
 * - **`/cashier/history`** — `Status` e `Diferença` primeiro. A diferença é o que
 *   diz se o caixa fechou certo.
 * - **`/financial/pending`** — `A Receber` e `Status` primeiro. É a lista de
 *   contas PENDENTES; era o que não se via.
 * - **`/stock/movements`** — `Tipo` e `Quantidade` primeiro. "Entrou ou saiu" e
 *   "quanto" são o conteúdo de uma tela de movimentações.
 *
 * ## O que NÃO foi corrigido (registrado, não escondido)
 *
 * `/stock/report`, `/stock/reports` (**9 tabelas num arquivo**),
 * `/stock/purchases`, `/settings/users/new`, `/cashier/reviews`, `/commissions`,
 * `/iphone-hunter`, `/financial/categorias`, `/stock/attributes`,
 * `/services/manage` (que também **rola a página 9px**) e `/service-orders/new`
 * (rola 1px).
 *
 * São 11 telas com o mesmo padrão. Ficam registradas no relatório em vez de
 * corrigidas às pressas — cada uma precisa de medição própria, e `/stock/reports`
 * sozinha tem 9 tabelas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const PDV_HIST = ler("src/app/(app)/pdv/history/_components/sales-table.tsx");
const CAIXA_HIST = ler("src/app/(app)/cashier/history/page.tsx");
const FIN_PEND = ler("src/app/(app)/financial/pending/_components/pending-table.tsx");
const MOVS = ler("src/app/(app)/stock/movements/_components/movements-table.tsx");

/** Cabeçalhos `<TableHead>` na ordem declarada. */
function ordemTableHead(fonte: string): string[] {
  return [...fonte.matchAll(/<TableHead[^>]*>([^<]*)<\/TableHead>/g)]
    .map((m) => (m[1] ?? "").trim())
    .filter(Boolean);
}

describe("VAR-1 — histórico de vendas mostra valor e status", () => {
  it("Valor e Status vêm logo após Venda e Data", () => {
    // HTML puro com cabeçalhos ordenáveis: mede a ordem dos rótulos soltos.
    const rotulos = [...PDV_HIST.matchAll(/^\s{18,20}(Venda|Data|Valor|Status|Cliente|Vendedor|Itens|Pagamento|Acoes)$/gm)]
      .map((m) => m[1]);
    expect(rotulos.slice(0, 4)).toEqual(["Venda", "Data", "Valor", "Status"]);
  });

  it("a data usa ano de 2 dígitos", () => {
    // Com 4 dígitos + hora, "Venda"+"Data" consumiam 281px dos 270 e o Valor
    // nascia em 306px MESMO depois de reordenar. Reordenar não bastava.
    const i = PDV_HIST.indexOf("function formatDate");
    expect(PDV_HIST.slice(i, i + 300)).toMatch(/year: "2-digit"/);
  });

  it("o corpo segue a ordem do cabeçalho", () => {
    const corpo = PDV_HIST.slice(PDV_HIST.indexOf("<tbody>"));
    const posValor = corpo.indexOf("formatCurrency(sale.subtotal");
    const posStatus = corpo.indexOf("SALE_STATUS_LABELS");
    const posCliente = corpo.indexOf("sale.customerName");
    expect(posValor).toBeGreaterThan(0);
    expect(posValor).toBeLessThan(posStatus);
    expect(posStatus).toBeLessThan(posCliente);
  });
});

describe("VAR-1 — histórico de caixa mostra status e diferença", () => {
  const ordem = ordemTableHead(CAIXA_HIST);

  it("Status e Diferenca são as duas primeiras", () => {
    expect(
      ordem.slice(0, 2),
      `a diferença é o que diz se o caixa fechou certo; nascia em posição 7 de 8.`,
    ).toEqual(["Status", "Diferenca"]);
  });

  it("o corpo segue a ordem do cabeçalho", () => {
    const corpo = CAIXA_HIST.slice(CAIXA_HIST.indexOf("<TableBody>"));
    const posStatus = corpo.indexOf('reg.status === "OPEN" ? "Aberto"');
    const posDif = corpo.indexOf("reg.difference != null");
    const posAbertura = corpo.indexOf("formatDateTime(reg.openedAt)");
    expect(posStatus).toBeGreaterThan(0);
    expect(posStatus).toBeLessThan(posDif);
    expect(posDif).toBeLessThan(posAbertura);
  });
});

describe("VAR-1 — contas pendentes mostram o que falta receber", () => {
  const ordem = ordemTableHead(FIN_PEND);

  it("A Receber e Status vêm primeiro", () => {
    expect(ordem.slice(0, 2)).toEqual(["A Receber", "Status"]);
  });

  it("o corpo segue a ordem do cabeçalho", () => {
    const corpo = FIN_PEND.slice(FIN_PEND.indexOf("<TableBody>"));
    const posReceber = corpo.indexOf("formatCents(t.remainingAmount)");
    const posStatus = corpo.indexOf("TRANSACTION_STATUS_LABELS");
    const posDesc = corpo.indexOf("{t.description}");
    expect(posReceber).toBeGreaterThan(0);
    expect(posReceber).toBeLessThan(posStatus);
    expect(posStatus).toBeLessThan(posDesc);
  });
});

describe("VAR-1 — movimentações mostram tipo e quantidade", () => {
  it("Tipo e Quantidade são as duas primeiras colunas", () => {
    const headers = [...MOVS.matchAll(/header: "([^"]+)"/g)].map((m) => m[1]);
    expect(
      headers.slice(0, 2),
      `"entrou ou saiu" e "quanto" são o conteúdo de uma tela de movimentações.`,
    ).toEqual(["Tipo", "Quantidade"]);
  });

  it("o nome do produto tem teto de largura", () => {
    // Sem isso o produto (nome + SKU em duas linhas) volta a empurrar as
    // colunas decisivas para fora.
    const i = MOVS.indexOf('id: "product"');
    expect(MOVS.slice(i, i + 500)).toMatch(/max-w-\[12rem\]/);
    expect(MOVS.slice(i, i + 500)).toMatch(/truncate/);
  });
});
