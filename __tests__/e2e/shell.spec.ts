import { test, expect, type Page } from "@playwright/test";

// Credentials from seed
const SUPER_ADMIN = { cpf: "12345678909", password: "Ar3naTech2026Super" };

async function loginAs(page: Page, cpf: string, password: string) {
  await page.goto("/login");
  const cpfInput = page.getByLabel("CPF");
  await cpfInput.click();
  await cpfInput.fill(cpf);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/", { timeout: 10_000 });
}

test.describe("App Shell", () => {
  test("login → dashboard shows layout shell (sidebar + header)", async ({ page }) => {
    await loginAs(page, SUPER_ADMIN.cpf, SUPER_ADMIN.password);

    // Should have sidebar
    await expect(page.locator("aside")).toBeVisible();

    // Should have header
    await expect(page.locator("header")).toBeVisible();

    // Should have main content
    await expect(page.locator("main")).toBeVisible();
  });

  test("sidebar collapses when toggle button clicked", async ({ page }) => {
    await loginAs(page, SUPER_ADMIN.cpf, SUPER_ADMIN.password);

    // Click toggle button
    const toggleBtn = page.locator('button[aria-label="Colapsar sidebar"]');
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    // Check it's now showing expand button
    await expect(page.locator('button[aria-label="Expandir sidebar"]')).toBeVisible();
  });

  test("sidebar collapse persists on reload (cookie)", async ({ page }) => {
    await loginAs(page, SUPER_ADMIN.cpf, SUPER_ADMIN.password);

    // Collapse sidebar
    const collapseBtn = page.locator('button[aria-label="Colapsar sidebar"]');
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await expect(page.locator('button[aria-label="Expandir sidebar"]')).toBeVisible();

    // Reload
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Should still be collapsed
    await expect(page.locator('button[aria-label="Expandir sidebar"]')).toBeVisible();

    // Restore: expand again
    await page.locator('button[aria-label="Expandir sidebar"]').click();
  });

  test("navigation via sidebar updates URL", async ({ page }) => {
    await loginAs(page, SUPER_ADMIN.cpf, SUPER_ADMIN.password);

    // Click on Clientes in sidebar
    const clientesLink = page.locator('aside a[href="/clientes"]');
    await expect(clientesLink).toBeVisible();
    await clientesLink.click();

    await expect(page).toHaveURL("/clientes");
  });

  test("⌘K opens command palette, Esc closes it", async ({ page }) => {
    await loginAs(page, SUPER_ADMIN.cpf, SUPER_ADMIN.password);

    // Open with keyboard shortcut
    await page.keyboard.press("Meta+k");
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });

    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test("/dev/components renders without errors (200)", async ({ page }) => {
    await loginAs(page, SUPER_ADMIN.cpf, SUPER_ADMIN.password);

    const res = await page.goto("/dev/components");
    expect(res?.status()).toBe(200);

    // Title should be visible
    await expect(page.locator("h1")).toContainText("Catálogo de Componentes");
  });

  test("toast appears when triggered from /dev/components", async ({ page }) => {
    await loginAs(page, SUPER_ADMIN.cpf, SUPER_ADMIN.password);
    await page.goto("/dev/components");

    // Click the Toast Success button
    await page.getByRole("button", { name: "Toast Success" }).click();

    // Sonner renders in [data-sonner-toaster]
    await expect(page.locator("[data-sonner-toaster]")).toBeVisible({ timeout: 3000 });
  });

  test("mobile (375px): hamburger present, desktop sidebar hidden", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginAs(page, SUPER_ADMIN.cpf, SUPER_ADMIN.password);

    // Desktop sidebar (aside) has 'hidden md:flex', not visible on mobile
    await expect(page.locator("aside")).not.toBeVisible();

    // Hamburger button should be visible
    await expect(page.locator('button[aria-label="Abrir menu"]')).toBeVisible();
  });
});
