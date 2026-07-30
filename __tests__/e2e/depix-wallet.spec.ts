import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers/cashier.helper";

/**
 * Finalização — Módulo 6 (DePix Wallet), passada de frontend.
 *
 * Primeiro E2E do módulo: até aqui a carteira DePix — o dinheiro irreversível do
 * sistema — não tinha **nenhum** teste de fluxo real. Estes casos são
 * independentes de dado (não exigem carteira provisionada nem cobrança viva),
 * para valerem tanto no seed quanto em produção.
 */

/** Piso da WCAG 1.4.10. */
const NARROW = { width: 320, height: 800 };

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("DePix Wallet — telas de dinheiro", () => {
  test("@smoke a carteira abre e cabe em 320px", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await loginAs(page, "operator");
    await page.goto("/depix-wallet");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("@business as rotas legadas de saque levam para a carteira", async ({ page }) => {
    // `/depix/*` são stubs de redirect desde a migração para `/depix-wallet`.
    // Se um deles voltar a renderizar tela própria, é sinal de que o fluxo de
    // saque ganhou uma segunda porta — exatamente o padrão que este programa
    // encontrou em três módulos.
    await loginAs(page, "operator");

    await page.goto("/depix/withdrawals");
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/depix-wallet");

    await page.goto("/depix/withdrawals/new");
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/depix-wallet/withdraw");
  });
});

test.describe("Pagamento público — o que o cliente vê", () => {
  test("@business link inexistente não expõe nada e responde 404", async ({ page }) => {
    // A página é pública e o token é o único controle de acesso: token inválido
    // não pode virar tela de cobrança nem vazar nome de comerciante.
    const res = await page.goto("/pay/token-que-nao-existe-mesmo");
    expect(res?.status()).toBe(404);
    await expect(page.locator("body")).not.toContainText(/Arena Tech|Pagar com PIX/i);
  });

  test("@business a página de pagamento cabe em 320px", async ({ page }) => {
    // É a tela que o cliente final abre no celular, quase sempre num aparelho
    // pequeno, e fora de qualquer sessão nossa.
    await page.setViewportSize(NARROW);
    const res = await page.goto("/pay/token-que-nao-existe-mesmo");
    expect(res?.status()).toBe(404);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
});
