/**
 * M9-1 (Etapa 7, Módulo 9 — Financeiro): o RBAC da ADR 0032 valia nas
 * **escritas** e sumia nos **relatórios**.
 *
 * `getUserRole` era chamado em 5 pontos — listar, criar, editar PAYABLE, pagar
 * parcela de PAYABLE. Nenhum relatório o chamava. Medido no navegador com um
 * operador real: operador e admin recebiam **a mesma tela de DRE**, com
 *
 *     RECEITA          R$ 1.556.378,58
 *     CUSTO DAS PECAS  R$ 1.356.092,69
 *     LUCRO BRUTO      R$   200.285,89
 *     DESPESAS         R$ 1.541.129,98
 *     LUCRO LIQUIDO   -R$ 1.340.844,09
 *
 * ...e o botão "Exportar CSV". Três operadores reais em produção.
 *
 * Decisão do dono (06/08/2026): **DRE e fluxo de caixa são de admin.**
 *
 * Este teste afirma a regra nos dois lados — resolver e navegação — porque o
 * defeito irmão (M9-3) mostrou que proteger só um lado deixa o outro
 * oferecendo uma tela que o backend recusa.
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
 * Recorta o corpo de uma procedure pelo nome. Buscar no arquivo inteiro faria
 * o teste passar por causa de qualquer OUTRA procedure já protegida — foi
 * exatamente assim que a primeira versão do teste do M9-3 passou cega.
 */
function corpoDaProcedure(nome: string): string {
  const inicio = ROUTER.indexOf(`  ${nome}: tenantProcedure`);
  if (inicio < 0) throw new Error(`procedure ${nome} não encontrada`);
  const resto = ROUTER.slice(inicio + 10);
  const proxima = resto.search(/\n {2}\w+: (?:tenant|admin)Procedure/);
  return proxima < 0 ? ROUTER.slice(inicio) : ROUTER.slice(inicio, inicio + 10 + proxima);
}

/** Relatórios consolidados: negados por inteiro a não-admin. */
const CONSOLIDADOS = ["dre", "cashFlow", "projectedCashFlow"];

/** Relatórios que o operador usa: nega-se o TIPO PAYABLE, não o relatório. */
const POR_TIPO = ["stats", "overdue"];

describe("M9-1 — relatório consolidado é de admin", () => {
  for (const nome of CONSOLIDADOS) {
    it(`${nome} nega a não-admin`, () => {
      const corpo = corpoDaProcedure(nome);
      expect(
        corpo,
        `${nome} precisa checar isTenantAdmin. Sem isso o operador vê receita, ` +
          `custo, lucro e despesa consolidados do ano (R$ 1,5 mi em produção).`,
      ).toMatch(/isTenantAdmin\(ctx\.session, ctx\.tenantId\)/);
      expect(corpo).toMatch(/FORBIDDEN/);
    });
  }
});

describe("relatórios do dia a dia continuam abertos ao operador", () => {
  for (const nome of POR_TIPO) {
    it(`${nome} nega o tipo PAYABLE, não o relatório inteiro`, () => {
      const corpo = corpoDaProcedure(nome);
      expect(corpo).toMatch(/isTenantAdmin/);
      expect(
        corpo,
        `${nome} não pode negar o relatório inteiro: RECEIVABLE é trabalho do ` +
          `operador. A regra aqui é sobre o TIPO.`,
      ).toMatch(/PAYABLE/);
    });
  }

  for (const nome of ["receivables", "pending"]) {
    it(`${nome} não ganhou gate de admin (é fixo em RECEIVABLE)`, () => {
      expect(corpoDaProcedure(nome)).not.toMatch(/isTenantAdmin/);
    });
  }
});

describe("a navegação não oferece o que o backend recusa", () => {
  const ROTAS_ADMIN = ["/financial/dre", "/financial/projected-cash-flow"];

  for (const href of ROTAS_ADMIN) {
    it(`${href} está marcado adminOnly no menu`, () => {
      const linha = NAV.split("\n").find((l) => l.includes(`href: "${href}"`));
      expect(linha, `item ${href} sumiu do menu — atualize este teste`).toBeDefined();
      expect(linha).toMatch(/adminOnly:\s*true/);
    });
  }
});
