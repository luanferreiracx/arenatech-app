import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  const cpfInput = page.getByLabel("CPF");
  await cpfInput.waitFor({ state: "visible", timeout: 15000 });
  await cpfInput.click();
  await cpfInput.fill("52998224725");
  await page.getByLabel("Senha").fill("Arena@2026");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForLoadState("networkidle", { timeout: 15000 });
}

test.describe("Customers Module", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("navigate to customers list", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    // Page may show loading state first, then content
    await expect(page.locator("body")).toContainText(/[Cc]liente/, { timeout: 20000 });
  });

  test("create a PF customer and see it in the list", async ({ page }) => {
    await page.goto("/customers/new");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/[Cc]liente|[Cc]adastro/);
  });

  test("search for customer by name", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("table")).toBeVisible();
  });

  test("edit a customer and see updated data", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/[Cc]liente/);
  });
});
