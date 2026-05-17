import { test, expect } from "@playwright/test";

test("@smoke usuário não autenticado redireciona para /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("@smoke página de login exibe campos CPF, senha e botão Entrar", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("CPF")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});
