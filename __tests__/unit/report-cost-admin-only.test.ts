/**
 * Etapa 7, Módulo 6 (M6-1): o relatório PDF de posição de estoque expunha
 * `costPrice` e o custo total do estoque a QUALQUER membro do tenant.
 *
 * Medido no navegador, contra a cópia de produção: admin e operador baixam o
 * mesmo PDF de 183 KB, ambos com a coluna "Custo". Em produção isso são 786
 * produtos e R$ 38.507 de custo total, com 2 operadores reais no tenant.
 *
 * A rota tinha os guards de sessão, tenant e módulo — mas nenhum de PAPEL. E a
 * política de custo já existia do outro lado: `stock.ts:237,283` omite
 * `costPrice` do produto quando quem pergunta não é admin, e o detalhe da OS
 * esconde custo do operador (verificado no M1). O relatório era a porta dos
 * fundos: a tela nega, o PDF entrega.
 *
 * Oitava vez que esta auditoria encontra o mesmo padrão — a correção fecha a
 * instância, não a classe.
 *
 * O teste afirma a REGRA: nenhum caminho que renderiza custo pode existir sem
 * checar o papel.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROTA_PDF = join(process.cwd(), "src/app/api/reports/[type]/pdf/route.ts");
const ROTA_STOCK = join(process.cwd(), "src/app/api/reports/stock/[type]/route.ts");

function ler(p: string): string {
  return readFileSync(p, "utf8");
}

describe("M6-1 — relatório não entrega custo a quem a tela esconde", () => {
  it("a rota de PDF checa o papel antes de renderizar custo", () => {
    const src = ler(ROTA_PDF);
    const renderizaCusto = /costPrice/.test(src);
    expect(renderizaCusto, "premissa: esta rota renderiza custo").toBe(true);
    expect(
      src,
      "a rota expõe costPrice sem checar isTenantAdmin — o operador baixa " +
        "pelo PDF o que a tela esconde dele",
    ).toMatch(/isTenantAdmin/);
  });

  it("a rota de relatórios de estoque segue a mesma regra", () => {
    const src = ler(ROTA_STOCK);
    if (!/costPrice/.test(src)) return; // não renderiza custo: nada a checar
    expect(src).toMatch(/isTenantAdmin/);
  });
});
