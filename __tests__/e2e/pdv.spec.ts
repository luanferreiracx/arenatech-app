import { test, expect, type Page } from "@playwright/test";

const SINGLE_TENANT = { cpf: "52998224725", password: "Arena@2026" };

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("CPF").fill(SINGLE_TENANT.cpf);
  await page.getByLabel("Senha").fill(SINGLE_TENANT.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/^\/(dashboard|customers|settings|service-orders|pdv).*$|^\/$/, {
    timeout: 10000,
  });
}

test.describe("PDV", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("navigates to /pdv and sees search input", async ({ page }) => {
    await page.goto("/pdv");
    await expect(page).toHaveURL("/pdv");
    await expect(
      page.getByPlaceholder(/Buscar produto/),
    ).toBeVisible({ timeout: 8000 });
  });

  test("shows cart section with empty state", async ({ page }) => {
    await page.goto("/pdv");
    await expect(page.getByText("Carrinho vazio")).toBeVisible({ timeout: 8000 });
  });

  test("navigates to /pdv/history and sees heading", async ({ page }) => {
    await page.goto("/pdv/history");
    await expect(page).toHaveURL("/pdv/history");
    await expect(
      page
        .getByRole("heading", { name: /Historico de Vendas/i })
        .or(page.getByText("Nenhum resultado")),
    ).toBeVisible({ timeout: 8000 });
  });

  test("stats cards are visible on history page", async ({ page }) => {
    await page.goto("/pdv/history");
    await expect(page.getByText("Vendas hoje")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("Receita hoje")).toBeVisible();
    await expect(page.getByText("Ticket medio")).toBeVisible();
  });

  test("sidebar has PDV link", async ({ page }) => {
    await page.goto("/");
    const pdvLink = page.locator("nav a[href='/pdv']");
    await expect(pdvLink).toBeVisible({ timeout: 8000 });
  });
});
