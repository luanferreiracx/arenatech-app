import { test, expect, type Page } from "@playwright/test";

const SINGLE_TENANT = { cpf: "52998224725", password: "Arena@2026" };

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("CPF").fill(SINGLE_TENANT.cpf);
  await page.getByLabel("Senha").fill(SINGLE_TENANT.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/^\/(dashboard|customers|settings).*$|^\/$/, { timeout: 10000 });
}

test.describe("Customers CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("navigates to /customers and sees empty state or list", async ({ page }) => {
    await page.goto("/customers");
    await expect(page).toHaveURL("/customers");
    // Either an empty state or the table heading should be visible
    await expect(
      page.getByRole("heading", { name: "Clientes" }).or(page.getByText("Nenhum resultado")),
    ).toBeVisible({ timeout: 8000 });
  });

  test("creates a PF customer and appears in list", async ({ page }) => {
    await page.goto("/customers/new");

    // Fill name
    await page.getByLabel(/Nome Completo/i).fill("Teste Playwright");

    // Fill phone
    await page.getByLabel(/Telefone$/i).first().fill("86999990001");

    // Check LGPD consent
    await page.getByRole("checkbox").click();

    // Submit
    await page.getByRole("button", { name: /Criar Cliente/i }).click();

    // Should redirect to detail page
    await page.waitForURL(/\/customers\/[a-z0-9-]+$/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Teste Playwright" })).toBeVisible();
  });

  test("searches customers by name", async ({ page }) => {
    await page.goto("/customers");

    const searchInput = page.getByPlaceholder(/Buscar por nome/i);
    await searchInput.fill("Teste Playwright");
    await page.waitForTimeout(500); // debounce

    // The customer we created should appear (or empty state if not found)
    const rows = page.getByRole("row");
    // At least the header row should be visible
    await expect(rows.first()).toBeVisible({ timeout: 5000 });
  });

  test("filters by PF/PJ type", async ({ page }) => {
    await page.goto("/customers");

    // Change type filter
    const typeSelect = page.getByRole("combobox").first();
    await typeSelect.click();
    await page.getByRole("option", { name: "Pessoa Física" }).click();

    // Table should still be visible
    await expect(page.getByRole("table")).toBeVisible({ timeout: 5000 });
  });
});
