import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/cashier.helper";

/**
 * Finalização — Módulo 2 (PDV), passada de frontend.
 *
 * Guarda o que a varredura de navegador encontrou: o PDV estourava a largura no
 * celular e o histórico exibia pedaço de UUID como se fosse a forma de pagamento.
 */

const MOBILE = { width: 390, height: 844 };

test.describe("PDV — layout e rótulos", () => {
  test("@business o PDV cabe na largura do celular", async ({ page }) => {
    // O cabeçalho (título + 3 ações) não quebrava linha e empurrava a página
    // inteira: medido 546px de conteúdo numa viewport de 390.
    await page.setViewportSize(MOBILE);
    await loginAs(page, "operator");
    await page.goto("/pdv");
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("@business o histórico de vendas cabe na largura do celular", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await loginAs(page, "operator");
    await page.goto("/pdv/history");
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("@business a coluna de pagamento nunca mostra pedaço de UUID", async ({ page }) => {
    // Quando a loja cadastra a própria forma, `method` guarda o ID dela; o
    // fallback imprimia os primeiros caracteres do UUID ("A6B9E6") como rótulo.
    await loginAs(page, "operator");
    await page.goto("/pdv/history");
    await page.waitForLoadState("networkidle");

    const badges = await page
      .locator("table tbody tr td:nth-child(7) span")
      .allTextContents();
    for (const badge of badges) {
      // Rótulo de forma de pagamento é palavra; pedaço de UUID é hexadecimal
      // puro com dígito no meio (ex.: "A6B9E6").
      expect(badge.trim()).not.toMatch(/^[0-9A-F]{6,8}$/);
    }
  });
});
