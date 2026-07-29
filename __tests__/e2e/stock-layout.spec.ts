import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers/cashier.helper";

/**
 * Finalização — Módulo 3 (Estoque), passada de frontend.
 *
 * Guarda o que a varredura de navegador encontrou nas 22 telas do módulo.
 * Os casos criam o próprio dado quando precisam dele: no banco de seed as telas
 * nascem vazias, e teste que passa por falta de conteúdo não guarda nada.
 */

/** Piso da WCAG 1.4.10 — nenhuma tela pode exigir scroll horizontal aqui. */
const NARROW = { width: 320, height: 800 };

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("Estoque — layout e listas", () => {
  test("@business a tela de importação cabe em 320px", async ({ page }) => {
    // O `input[type=file]` tem largura intrínseca larga; sem teto ele estourava
    // a viewport (medido: 444px de conteúdo em 390 de tela).
    await page.setViewportSize(NARROW);
    await loginAs(page, "operator");
    await page.goto("/stock/import");
    await page.waitForLoadState("networkidle");

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  // A key ausente na lista de atributos ficou guardada pela VARREDURA
  // (`scripts/audit/crawl-module.ts estoque`), que foi quem a encontrou: ela lê
  // o console em todas as telas do módulo. Um E2E aqui exigiria criar atributo
  // pela UI como gerência e ficou frágil no seed — melhor não ter teste do que
  // ter um que passa por falta de conteúdo.
});
