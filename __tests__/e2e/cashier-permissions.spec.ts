import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/cashier.helper";

/**
 * Finalização — Módulo 1 (Caixa), passada de frontend.
 *
 * Guarda o que a varredura de navegador encontrou e ninguém tinha visto lendo
 * código. Cada teste falha na versão anterior do app.
 */

test.describe("Caixa — o que o operador vê", () => {
  test("@smoke o conteúdo da tela é clicável no desktop", async ({ page }) => {
    // A gaveta lateral do mobile era derivada de `!isCollapsed`, o mesmo estado
    // da sidebar de desktop, com defaults OPOSTOS. Sem o cookie de sidebar (ou
    // seja, no primeiro acesso de qualquer pessoa), o Sheet abria no desktop:
    // overlay modal, `pointer-events: none` no body e `aria-hidden` no conteúdo.
    // O app inteiro ficava sem clique.
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, "operator");
    await page.goto("/cashier/history");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(page.locator("main")).toBeVisible();
    // O teste real: clicar em algo do conteúdo, não só vê-lo.
    await page.getByRole("link", { name: /Caixa/ }).first().click({ timeout: 5000 });
  });

  test("@business a conferência não é oferecida ao operador", async ({ page }) => {
    // O menu não tinha dimensão de papel: "Conferencias" aparecia para todo
    // mundo e o operador que clicasse tomava 403 com meia tela.
    await loginAs(page, "operator");
    await page.goto("/cashier");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("link", { name: "Conferencias" })).toHaveCount(0);
  });

  test("@business acesso direto à conferência explica a regra em vez de travar", async ({
    page,
  }) => {
    // Antes: esqueleto eterno (3 retries num 403 determinístico) e, depois deles,
    // a mensagem ERRADA — "Nenhum caixa pendente de conferencia", ou seja, o
    // sistema afirmava que estava tudo conferido para quem não podia ver nada.
    await loginAs(page, "operator");
    await page.goto("/cashier/reviews");

    await expect(page.getByText("Voce nao tem acesso a esta tela")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Nenhum caixa pendente/i)).toHaveCount(0);
  });

  test("@business a tela de fechar caixa não fica presa em esqueleto", async ({ page }) => {
    // Sem caixa aberto o servidor responde 404 — resposta do NEGÓCIO, que não
    // muda se perguntarmos de novo. O retry padrão (3x com backoff) segurava a
    // tela em esqueleto por ~7s antes de contar a verdade. Este teste não
    // depende de haver ou não caixa aberto: qualquer um dos dois desfechos
    // serve, desde que a tela SAIA do esqueleto depressa.
    await loginAs(page, "operator");
    await page.goto("/cashier/close");
    await page.waitForTimeout(3_000);

    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
    await expect(
      page.getByText(/[Nn]enhum caixa aberto|Saldo esperado|Conferencia por forma/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
