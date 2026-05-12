import { test, expect } from "@playwright/test";

test.describe("Customers Module", () => {
  test.beforeEach(async ({ page }) => {
    // Login as seed user
    await page.goto("/auth/login");
    await page.getByPlaceholder("000.000.000-00").fill("529.982.247-25");
    await page.getByPlaceholder("Sua senha").fill("Arena@2025");
    await page.getByRole("button", { name: "Entrar" }).click();
    // Wait for redirect to dashboard or tenant select
    await page.waitForURL(/^\/(select-tenant)?$/);
    // If on select-tenant, pick the first one
    if (page.url().includes("select-tenant")) {
      await page.getByRole("button").first().click();
      await page.waitForURL("/");
    }
  });

  test("navigate to customers list", async ({ page }) => {
    await page.goto("/customers");
    await expect(page.getByText("Clientes")).toBeVisible();
    await expect(page.getByText("Novo Cliente")).toBeVisible();
  });

  test("create a PF customer and see it in the list", async ({ page }) => {
    await page.goto("/customers/new");
    await expect(page.getByText("Novo Cliente")).toBeVisible();

    // Fill name
    await page.getByPlaceholder("Digite o nome completo").fill("Cliente Teste E2E");

    // Fill CPF (valid)
    await page.getByPlaceholder("000.000.000-00").fill("52998224725");

    // Submit
    await page.getByRole("button", { name: "Cadastrar Cliente" }).click();

    // Wait for redirect to detail
    await page.waitForURL(/\/customers\/[a-f0-9-]+$/);
    await expect(page.getByText("Cliente Teste E2E")).toBeVisible();
  });

  test("search for customer by name", async ({ page }) => {
    await page.goto("/customers");

    // Type in search
    const searchInput = page.getByPlaceholder(/Buscar/);
    await searchInput.fill("Cliente");

    // Wait for results to filter
    await page.waitForTimeout(500);

    // The table should still be visible
    await expect(page.locator("table")).toBeVisible();
  });

  test("edit a customer and see updated data", async ({ page }) => {
    // First create a customer
    await page.goto("/customers/new");
    await page.getByPlaceholder("Digite o nome completo").fill("Editar Teste E2E");
    await page.getByPlaceholder("000.000.000-00").fill("52998224725");
    await page.getByRole("button", { name: "Cadastrar Cliente" }).click();
    await page.waitForURL(/\/customers\/[a-f0-9-]+$/);

    // Go to edit
    await page.getByRole("link", { name: "Editar" }).click();
    await page.waitForURL(/\/edit$/);

    // Update name
    const nameInput = page.getByPlaceholder("Digite o nome completo");
    await nameInput.clear();
    await nameInput.fill("Editado Teste E2E");

    // Submit
    await page.getByRole("button", { name: "Salvar Alteracoes" }).click();

    // Wait for redirect to detail
    await page.waitForURL(/\/customers\/[a-f0-9-]+$/);
    await expect(page.getByText("Editado Teste E2E")).toBeVisible();
  });
});
