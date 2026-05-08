import { test, expect, type Page } from "@playwright/test";

const SINGLE_TENANT = { cpf: "52998224725", password: "Arena@2026" };

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("CPF").fill(SINGLE_TENANT.cpf);
  await page.getByLabel("Senha").fill(SINGLE_TENANT.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/^\/(dashboard|customers|settings|service-orders).*$|^\/$/, {
    timeout: 10000,
  });
}

test.describe("Service Orders", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("navigates to /service-orders and sees heading", async ({ page }) => {
    await page.goto("/service-orders");
    await expect(page).toHaveURL("/service-orders");
    await expect(
      page
        .getByRole("heading", { name: "Ordens de Serviço" })
        .or(page.getByText("Nenhum resultado")),
    ).toBeVisible({ timeout: 8000 });
  });

  test("navigates to /service-orders/new and sees wizard", async ({ page }) => {
    await page.goto("/service-orders/new");
    await expect(page).toHaveURL("/service-orders/new");
    await expect(
      page.getByRole("heading", { name: "Nova Ordem de Serviço" }),
    ).toBeVisible({ timeout: 8000 });
    // Step 1 should be visible
    await expect(page.getByText("1. Selecione o Cliente")).toBeVisible();
  });

  test("stats cards are visible on listing page", async ({ page }) => {
    await page.goto("/service-orders");
    await expect(page.getByText("Abertas")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("Em andamento")).toBeVisible();
    await expect(page.getByText("Concluídas (mês)")).toBeVisible();
    await expect(page.getByText("Receita (mês)")).toBeVisible();
  });

  test("Nova OS button links to wizard", async ({ page }) => {
    await page.goto("/service-orders");
    await page.getByRole("link", { name: "Nova OS" }).first().click();
    await expect(page).toHaveURL("/service-orders/new");
  });
});
