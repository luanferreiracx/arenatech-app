import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers/cashier.helper";

/**
 * Finalização — Módulo 4 (Ordens de Serviço), passada de frontend.
 */

/** Piso da WCAG 1.4.10 — nenhuma tela pode exigir scroll horizontal aqui. */
const NARROW = { width: 320, height: 800 };

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("Operação — layout", () => {
  test("@business a tela de operação cabe em 320px", async ({ page }) => {
    // A faixa de abas do shadcn é `inline-flex w-fit` sem teto: com 4 abas
    // (Entregadores, Laboratórios, Envios Lab, Prestadores) ela fica mais larga
    // que o celular e empurra a PÁGINA inteira — medido 399px numa viewport de
    // 390. A correção foi no primitivo, então vale para as 9 telas com abas.
    await page.setViewportSize(NARROW);
    await loginAs(page, "operator");
    await page.goto("/operation");
    await page.waitForLoadState("networkidle");

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
});
