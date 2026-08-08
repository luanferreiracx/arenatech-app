import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers/cashier.helper";

/**
 * WCAG 1.4.10 (reflow) nas telas do dia a dia — auditoria de frontend 2026-08-05.
 *
 * A auditoria listou ~30 caixas de texto livre "sem estratégia de overflow".
 * Corrigir as 30 no escuro seria trabalho especulativo: a maioria não quebra
 * nada. O que importa é a medida — a 320px, com dado longo de verdade na tela,
 * quanto passa da viewport? Só um caso quebrava (`/painel`, 5px), e por
 * *truncate-ghost*: o `truncate` estava lá, mas faltava `min-w-0` num elo do
 * meio da cadeia flex, então o item nunca encolhia.
 *
 * Por isso o teste mede em vez de conferir classe: `truncate` presente não
 * prova nada, e `truncate` ausente nem sempre é defeito.
 *
 * O que fica de fora, de propósito: tabela. As listas ficam num wrapper com
 * `overflow-x: auto`, e scroll horizontal DENTRO de um container é estratégia
 * válida da 1.4.10 para dado tabular — a página não estoura por causa delas.
 * Confirmado por controle negativo: `white-space: nowrap` numa célula com nome
 * de 68 caracteres deixou o overflow do documento em 0.
 */

/** Piso da WCAG 1.4.10: nenhuma tela pode exigir scroll horizontal. */
const NARROW = { width: 320, height: 800 };

/** Telas que o operador usa o dia inteiro, com listas de dado do usuário. */
/**
 * LIMITE CONHECIDO desta suíte (auditoria 2026-08-07, E9-2).
 *
 * O seed do CI **não cria ordens de serviço** (`grep serviceOrder prisma/seed.ts`
 * → 0). Sem linhas, a tabela e a barra de paginação **não renderizam**, e estas
 * telas são medidas VAZIAS — o teste passa sem exercitar o layout real.
 *
 * Foi exatamente assim que o estouro da paginação (271px de flex rígido → 347px
 * a 320px de viewport) sobreviveu: `/service-orders` está na lista abaixo desde
 * a criação da suíte, o full pós-merge passou verde, e o defeito só apareceu
 * quando a auditoria mediu contra a **cópia de produção**, que tem 255 OS.
 *
 * O teste em si é bom — reproduzido com o banco cheio, ele falha sem o fix e
 * passa com ele. O que falta é DADO, não asserção.
 *
 * Para fechar de verdade: semear ao menos 11 linhas (acima do `pageSize` de 10)
 * nas entidades destas telas, ou medir contra um tenant de demonstração já
 * populado.
 */
const TELAS = [
  "/painel",
  "/customers",
  "/service-orders",
  "/pdv",
  "/stock",
  "/financial",
  "/financial/receivables",
  "/cashier",
];

async function overflowHorizontal(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("reflow a 320px", () => {
  for (const rota of TELAS) {
    test(`@business ${rota} cabe em 320px`, async ({ page }) => {
      await page.setViewportSize(NARROW);
      await loginAs(page, "operator");
      await page.goto(rota);
      await page.waitForLoadState("networkidle");

      const overflow = await overflowHorizontal(page);
      // Quando estoura, aponta o elemento culpado — descobrir isso na mão custa
      // caro, e o `min-w-0` que falta quase nunca está onde se imagina.
      const culpado =
        overflow > 1
          ? await page.evaluate(() => {
              const largura = document.documentElement.clientWidth;
              for (const el of Array.from(document.querySelectorAll("*"))) {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.right > largura + 1) {
                  const cls = typeof el.className === "string" ? el.className : "";
                  return `${el.tagName}.${cls.slice(0, 80)} — "${el.textContent?.trim().slice(0, 40)}"`;
                }
              }
              return "(não localizado)";
            })
          : "";

      expect(overflow, `${rota} estoura ${overflow}px. Primeiro culpado: ${culpado}`).toBeLessThanOrEqual(1);
    });
  }

  // NÃO existe aqui um teste de "nome longo estoura a lista". Escrevi um, e o
  // controle negativo o reprovou: forcei `white-space: nowrap` numa célula com
  // nome de 68 caracteres e o overflow do documento continuou 0. As tabelas
  // ficam num wrapper com `overflow-x: auto` — scroll horizontal DENTRO de um
  // container é estratégia válida da WCAG 1.4.10 para dado tabular, e a página
  // nunca estoura. Ou seja: o teste não podia falhar, e teste que não falha não
  // guarda nada. As 8 medições acima cobrem o reflow da página, que é o que
  // realmente pode quebrar.
});
