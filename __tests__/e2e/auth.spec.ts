import { test, expect, type Page } from "@playwright/test";

// Credentials from seed (default env values)
const SUPER_ADMIN = { cpf: "12345678909", password: "Ar3naTech2026Super" };
const SINGLE_TENANT = { cpf: "52998224725", password: "Arena@2026" };
const MULTI_TENANT = { cpf: "11144477735", password: "Multi@2026" };

async function login(page: Page, cpf: string, password: string) {
  await page.goto("/login");
  const cpfInput = page.getByLabel("CPF");
  await cpfInput.click();
  await cpfInput.fill(cpf);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("login with invalid CPF shows error", async ({ page }) => {
  await page.goto("/login");
  const cpfInput = page.getByLabel("CPF");
  await cpfInput.fill("11111111111");
  await page.getByLabel("Senha").fill("wrong");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText("Credenciais inválidas")).toBeVisible({ timeout: 5000 });
});

test("login with wrong password shows generic error", async ({ page }) => {
  await page.goto("/login");
  const cpfInput = page.getByLabel("CPF");
  await cpfInput.fill(SINGLE_TENANT.cpf);
  await page.getByLabel("Senha").fill("wrongpassword");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText("Credenciais inválidas")).toBeVisible({ timeout: 5000 });
});

test("single-tenant user logs in and goes to dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("CPF").fill(SINGLE_TENANT.cpf);
  await page.getByLabel("Senha").fill(SINGLE_TENANT.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Should see dashboard with tenant name
  await expect(page.getByText("Bem-vindo")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Arena Tech")).toBeVisible();
});

test("multi-tenant user logs in and goes to select-tenant", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("CPF").fill(MULTI_TENANT.cpf);
  await page.getByLabel("Senha").fill(MULTI_TENANT.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Should see tenant selection
  await expect(page.getByText("Selecione a loja")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Arena Tech")).toBeVisible();
  await expect(page.getByText("Loja Teste")).toBeVisible();

  // Select first tenant
  await page.getByText("Arena Tech").click();
  await expect(page.getByText("Bem-vindo")).toBeVisible({ timeout: 10000 });
});

test("super admin logs in and goes to admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("CPF").fill(SUPER_ADMIN.cpf);
  await page.getByLabel("Senha").fill(SUPER_ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText("Painel Super Admin")).toBeVisible({ timeout: 10000 });
});

test("logout clears session", async ({ page }) => {
  // Login first
  await page.goto("/login");
  await page.getByLabel("CPF").fill(SINGLE_TENANT.cpf);
  await page.getByLabel("Senha").fill(SINGLE_TENANT.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Bem-vindo")).toBeVisible({ timeout: 10000 });

  // Logout
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
});
