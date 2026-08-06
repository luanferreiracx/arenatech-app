/**
 * M9-2 (Etapa 7, Módulo 9 — Financeiro): o DRE somava como despesa o pagamento
 * de obrigações **canceladas**.
 *
 * A receita sempre filtrou o status da venda (`s.status IN ('COMPLETED',
 * 'PARTIALLY_REFUNDED')`). A despesa filtrava `type = 'PAYABLE'` e
 * `deleted_at IS NULL` — **não o status da obrigação**. Mesma regra, aplicada
 * de um lado só: o padrão que esta auditoria encontrou dez vezes.
 *
 * Efeito medido em produção (DRE 2026, tenant `arena-tech`):
 *
 * | | antes | depois |
 * |---|---|---|
 * | despesas | R$ 1.541.129,98 | **R$ 786.729,98** |
 * | lucro líquido | -R$ 1.340.844,09 | **-R$ 586.444,09** |
 *
 * A diferença são R$ 754.400 em três PAYABLE `CANCELLED` cujo pagamento ficou
 * no ledger — uma delas de R$ 740.000, cuja origem o dono não reconhece
 * ("não sei o que houve"). Sem lastro em `device_purchases`, ela fica de fora
 * do resultado por decisão dele (06/08/2026), em vez de ser carimbada como
 * despesa real.
 *
 * Este teste afirma a REGRA no SQL. Não há caminho de UI que a exercite sem
 * banco, então a asserção é sobre a query — o comportamento fim-a-fim foi
 * verificado no navegador e reconciliado contra o banco (R$ 158.300 em julho
 * para `arena-tech`; os R$ 2.500 restantes eram do tenant de auditoria, o que
 * de quebra confirma que o escopo por tenant funciona).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/financial.ts"),
  "utf8",
);

/** A query de despesa do DRE: a que lê o ledger de pagamentos. */
function queryDeDespesaDoDre(): string {
  const i = ROUTER.indexOf("FROM installment_payments ip");
  expect(i, "query de despesa do DRE não encontrada — o DRE mudou de forma").toBeGreaterThan(0);
  return ROUTER.slice(i, i + 900);
}

describe("M9-2 — DRE não conta obrigação cancelada como despesa", () => {
  it("a query de despesa exclui status CANCELLED", () => {
    expect(
      queryDeDespesaDoDre(),
      "Sem `t.status <> 'CANCELLED'` o DRE soma pagamento de obrigação " +
        "cancelada. Medido: R$ 754.400 em 2026, quase metade da despesa do ano.",
    ).toMatch(/t\.status\s*<>\s*'CANCELLED'/);
  });

  it("continua excluindo obrigação apagada (a regra que já existia)", () => {
    expect(queryDeDespesaDoDre()).toMatch(/t\.deleted_at IS NULL/);
  });

  it("a receita segue filtrando o status da venda — os dois lados concordam", () => {
    expect(ROUTER).toMatch(/s\.status IN \('COMPLETED', 'PARTIALLY_REFUNDED'\)/);
  });
});
