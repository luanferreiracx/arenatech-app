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
 */

/** Piso da WCAG 1.4.10: nenhuma tela pode exigir scroll horizontal. */
const NARROW = { width: 320, height: 800 };

/** Telas que o operador usa o dia inteiro, com listas de dado do usuário. */
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

/** Nome comprido de verdade — texto curto de seed não exercita reflow. */
const NOME_LONGO = "Bartolomeu Maximiliano Vasconcellos Albuquerque Wanderley Nepomuceno";

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

  test("@business nome longo de cliente não estoura a lista", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await loginAs(page, "operator");
    await page.goto("/customers/new");
    await page.waitForLoadState("networkidle");

    // Cria o dado que o teste precisa: no seed os nomes são curtos e a tela
    // passaria por falta de conteúdo, não por estar correta.
    await page.getByLabel(/nome/i).first().fill(NOME_LONGO);
    await page.getByLabel(/telefone|celular/i).first().fill("86999887766");
    await page.getByRole("button", { name: /salvar|cadastrar|criar/i }).first().click();
    await page.waitForLoadState("networkidle");

    await page.goto("/customers");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(NOME_LONGO.slice(0, 20)).first()).toBeVisible({ timeout: 10000 });

    expect(await overflowHorizontal(page)).toBeLessThanOrEqual(1);
  });
});
