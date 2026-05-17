import { test, expect } from "@playwright/test";

test("@smoke unauthenticated user is redirected to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("@smoke login page shows CPF and password fields", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("CPF")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});
