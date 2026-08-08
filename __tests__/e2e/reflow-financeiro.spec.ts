/**
 * E9-4 (Etapa 9, Módulo 4 — Financeiro): o DRE rolava horizontalmente a 320px e
 * a 640px, violando WCAG 1.4.10.
 *
 * A origem **não era a tabela** — e essa foi a parte difícil. O primeiro
 * detector acusou `TABLE.w-full`, e a acusação era falsa: o componente `Table`
 * fica num wrapper com `overflow-x-auto`, e **scroll dentro de container é
 * estratégia válida da 1.4.10** para dado tabular.
 *
 * A prova por eliminação fechou a questão: removendo a tabela do DOM, o
 * `scrollWidth` continuou em **353px**. O culpado real era o **grid de
 * cartões-resumo** (`grid-cols-2` fixo) com valores como `R$ 1.556.378,58` em
 * `text-lg font-mono` — dois cartões não cabem em 320px.
 *
 * ## O critério certo é a PÁGINA rolar, não o elemento ser largo
 *
 * `scrollWidth > clientWidth` acusa qualquer elemento largo, inclusive os que
 * têm scroll próprio e legítimo. Este teste usa o critério da norma:
 *
 * ```ts
 * window.scrollTo(50, 0);  // a PÁGINA se move?
 * window.scrollX > 0       // se sim, viola 1.4.10
 * ```
 *
 * ## Limite conhecido (mesmo do reflow-320.spec.ts)
 *
 * O seed do CI **não cria dados financeiros**, então estas telas podem ser
 * medidas vazias. Foi assim que o defeito sobreviveu: ele só aparece com
 * valores longos (`R$ 1.556.378,58`), que exigem 1.341 obrigações reais.
 *
 * A auditoria mediu contra a **cópia de produção**. Este teste vale como
 * regressão quando houver dado; com banco vazio, ele passa sem exercitar.
 */
import { test, expect, type Page } from "@playwright/test";

/**
 * O DRE é admin-only (E9-1 da Etapa 8), e escolher o login certo custou duas
 * tentativas — ambas passando CEGO:
 *
 * 1. `loginAs(page, "manager")` — o manager do seed **não existe** na cópia de
 *    produção. O login falha, a tela vem vazia, e o teste mede uma página em
 *    branco.
 * 2. `loginAs(page, "owner")` — superadmin é **redirecionado para `/admin`** e
 *    nunca chega ao DRE.
 *
 * Por isso este arquivo loga direto, com um admin **de tenant**: é o único
 * papel que vê o DRE com dados. A lição vale além deste teste — helper de
 * login compartilhado esconde qual usuário realmente chegou na tela.
 */
async function loginComoAdminDeTenant(page: Page) {
  await page.goto("/login");
  await page.getByLabel("CPF").fill("86288366757");
  await page.getByLabel("Senha").fill("Admin@2026");
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
}

const ESTREITO = { width: 320, height: 700 };

/** Telas do Financeiro que a auditoria mediu contra produção. */
const TELAS = [
  "/financial",
  "/financial/dre",
  "/financial/cash-flow",
  "/financial/receivables",
  "/financial/card-receivables",
  "/financial/projected-cash-flow",
];

/**
 * A PÁGINA rola na horizontal? É o critério da WCAG 1.4.10 — e não
 * "existe elemento mais largo que a viewport", que acusa scroller legítimo.
 */
async function paginaRolaHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.scrollTo(50, 0);
    const x = window.scrollX;
    window.scrollTo(0, 0);
    return x;
  });
}

test.describe("reflow do Financeiro a 320px", () => {
  for (const rota of TELAS) {
    test(`@business ${rota} não rola horizontalmente a 320px`, async ({ page }) => {
      await page.setViewportSize(ESTREITO);
      await loginComoAdminDeTenant(page);
      await page.goto(rota);
      await page.waitForLoadState("networkidle");

      const rolou = await paginaRolaHorizontal(page);

      // Quando rola, aponta o bloco culpado — mas SÓ o que está fora de um
      // scroller, senão a tabela leva a culpa injustamente (foi o que
      // aconteceu na primeira medição desta auditoria).
      const culpado =
        rolou > 0
          ? await page.evaluate(() => {
              const vw = document.documentElement.clientWidth;
              const dentroDeScroller = (el: Element): boolean => {
                let p = el.parentElement;
                while (p) {
                  const ox = getComputedStyle(p).overflowX;
                  if (ox === "auto" || ox === "scroll") return true;
                  p = p.parentElement;
                }
                return false;
              };
              for (const el of Array.from(document.querySelectorAll("body *"))) {
                if (dentroDeScroller(el)) continue;
                if (el.getBoundingClientRect().right > vw + 1) {
                  const cls = typeof el.className === "string" ? el.className : "";
                  return `${el.tagName}.${cls.slice(0, 70)}`;
                }
              }
              return "(fora de scroller: nada — investigar por eliminação)";
            })
          : "";

      expect(rolou, `${rota} rola ${rolou}px na horizontal. Culpado: ${culpado}`).toBe(0);
    });
  }
});
