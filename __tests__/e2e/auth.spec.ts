import { test, expect, type Page } from "@playwright/test";

// Credentials from seed (default env values)
const SUPER_ADMIN = { cpf: "12345678909", password: "Ar3naTech2026Super" };
const SINGLE_TENANT = { cpf: "52998224725", password: "Arena@2026" };
const MULTI_TENANT = { cpf: "11144477735", password: "Multi@2026" };

async function login(page: Page, cpf: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  const cpfInput = page.getByLabel("CPF");
  await cpfInput.waitFor({ state: "visible", timeout: 15000 });
  await cpfInput.click();
  await cpfInput.fill(cpf);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("@business login with invalid CPF shows error", async ({ page }) => {
  await page.goto("/login");
  const cpfInput = page.getByLabel("CPF");
  await cpfInput.fill("11111111111");
  await page.getByLabel("Senha").fill("wrong");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText("CPF ou senha inválidos")).toBeVisible({ timeout: 5000 });
});

test("@business login with wrong password shows generic error", async ({ page }) => {
  await page.goto("/login");
  const cpfInput = page.getByLabel("CPF");
  await cpfInput.fill(SINGLE_TENANT.cpf);
  await page.getByLabel("Senha").fill("wrongpassword");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText("CPF ou senha inválidos")).toBeVisible({ timeout: 5000 });
});

test("@smoke login de usuário single-tenant carrega dashboard", async ({ page }) => {
  await login(page, SINGLE_TENANT.cpf, SINGLE_TENANT.password);
  await page.waitForLoadState("networkidle", { timeout: 15000 });

  // Single-tenant user goes to "/" (dashboard) — verify page loaded with app content
  await expect(page.locator("body")).toContainText(/[Bb]em-vindo|[Dd]ashboard|Arena/, { timeout: 10000 });
});

test("@business multi-tenant user logs in and goes to select-tenant", async ({ page }) => {
  await login(page, MULTI_TENANT.cpf, MULTI_TENANT.password);
  await page.waitForLoadState("networkidle", { timeout: 15000 });

  // Multi-tenant user sees tenant selection
  await expect(page.getByText("Selecione a loja")).toBeVisible({ timeout: 10000 });

  // Select first tenant (use more specific selector)
  await page.getByRole("button", { name: /Arena Tech/ }).first().click();
  await page.waitForLoadState("networkidle", { timeout: 15000 });

  // After selection, should be in the app
  await expect(page.locator("body")).toContainText(/[Bb]em-vindo|[Dd]ashboard|Arena/, { timeout: 10000 });
});

test("@smoke login de super admin carrega página pós-login", async ({ page }) => {
  await login(page, SUPER_ADMIN.cpf, SUPER_ADMIN.password);
  await page.waitForLoadState("networkidle", { timeout: 15000 });

  // Super admin may go to /admin or to select-tenant first
  await expect(page.locator("body")).toContainText(/[Aa]dmin|[Ss]elecione|[Dd]ashboard/, { timeout: 15000 });
});

test("@smoke usuário autenticado não permanece em /login", async ({ page }) => {
  await login(page, SINGLE_TENANT.cpf, SINGLE_TENANT.password);
  await page.waitForLoadState("networkidle", { timeout: 15000 });

  // Verify login succeeded (user is in the app)
  await expect(page.locator("body")).toContainText(/Arena/, { timeout: 10000 });

  // Navigate to /login directly should redirect to app (already logged in)
  await page.goto("/login");
  await page.waitForLoadState("networkidle", { timeout: 10000 });
  // Should NOT stay on login page since we're authenticated
  const url = page.url();
  expect(url).not.toMatch(/\/login$/);
});
