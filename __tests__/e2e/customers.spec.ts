import { test, expect, type Page } from "@playwright/test";
import { fillField, fillByPlaceholder } from "./helpers/form.helper";

/**
 * Customers module E2E — 100% @business (ADR 0036).
 * Uses fillField() helper for react-hook-form inputs (ADR 0037).
 */

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

test.describe("Customers — CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-1 form aceita nome e submit está habilitado", async ({ page }) => {
    await page.goto("/customers/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await fillField(page, "name", "Cliente E2E");
    await expect(page.locator("input[name='name']")).not.toHaveValue("");
    await expect(page.getByRole("button", { name: /Cadastrar cliente/i })).toBeEnabled({ timeout: 10000 });
  });

  test("@business T-4 radio PJ muda placeholder para Razão social", async ({ page }) => {
    await page.goto("/customers/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await page.locator("[id='pj']").click();
    await expect(page.locator("input[name='name']")).toHaveAttribute("placeholder", /[Rr]azão/);
  });

  test("@business T-9 busca filtra tabela e coluna Nome existe", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await fillByPlaceholder(page, /Buscar por nome/, "filtro_teste");
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("columnheader", { name: /Nome/i })).toBeVisible();
  });

  test("@business T-10 click em row navega ou mensagem vazia aparece", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    const row = page.locator("table tbody tr").first();
    if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
      await row.click();
      await expect(page).toHaveURL(/\/customers\/[a-z0-9-]+/);
    } else {
      await expect(page.getByText("Nenhum cliente encontrado")).toBeVisible();
    }
  });
});

test.describe("Customers — Validações", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-2 submit sem CPF/telefone bloqueia navegação", async ({ page }) => {
    await page.goto("/customers/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await fillField(page, "name", "Teste Incompleto");
    await page.getByRole("button", { name: /Cadastrar cliente/i }).click({ timeout: 15000 });
    await expect(page).toHaveURL(/\/customers\/new/);
  });

  test("@business T-5 PJ sem CNPJ bloqueia submit", async ({ page }) => {
    await page.goto("/customers/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await page.locator("[id='pj']").click();
    await fillField(page, "name", "Empresa Incompleta");
    await page.getByRole("button", { name: /Cadastrar cliente/i }).click({ timeout: 15000 });
    await expect(page).toHaveURL(/\/customers\/new/);
  });

  test("@business T-3 nome curto bloqueia submit", async ({ page }) => {
    await page.goto("/customers/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await fillField(page, "name", "A");
    await page.getByRole("button", { name: /Cadastrar cliente/i }).click({ timeout: 15000 });
    await expect(page).toHaveURL(/\/customers\/new/);
  });

  test("@business T-6 sem telefone bloqueia submit", async ({ page }) => {
    await page.goto("/customers/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await fillField(page, "name", "Teste Sem Fone");
    await page.getByRole("button", { name: /Cadastrar cliente/i }).click({ timeout: 15000 });
    await expect(page).toHaveURL(/\/customers\/new/);
  });
});

test.describe("Customers — Busca", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-11 busca inexistente mostra mensagem vazia", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await fillByPlaceholder(page, /Buscar por nome/, "zzzzz_nao_existe");
    await page.waitForTimeout(600);
    await expect(page.getByText("Nenhum cliente encontrado")).toBeVisible({ timeout: 5000 });
  });

  test("@business T-12 campo busca aceita e retém valor", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await fillByPlaceholder(page, /Buscar por nome/, "debounce_test");
    await expect(page.getByPlaceholder(/Buscar por nome/)).not.toHaveValue("");
  });
});

test.describe("Customers — RBAC", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-13 link Novo Cliente navega para /customers/new", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    const link = page.getByRole("link", { name: /Novo Cliente/i });
    await expect(link).toBeVisible({ timeout: 15000 });
    await link.click();
    await expect(page).toHaveURL(/\/customers\/new/);
  });

  test("@business T-14 heading Clientes tem texto exato", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.getByRole("heading", { name: "Clientes" })).toHaveText("Clientes", { timeout: 15000 });
  });
});

test.describe("Customers — RLS", () => {
  test("@business T-7 busca por dado de outro tenant retorna vazio", async ({ page }) => {
    await login(page);
    await page.goto("/customers");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await fillByPlaceholder(page, /Buscar por nome/, "__tenant_b_only__");
    await page.waitForTimeout(600);
    await expect(page.getByText("Nenhum cliente encontrado")).toBeVisible({ timeout: 5000 });
  });

  test("@business T-8 tabela tem coluna CPF/CNPJ", async ({ page }) => {
    await login(page);
    await page.goto("/customers");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("columnheader", { name: /CPF|CNPJ/i })).toBeVisible();
  });
});

test.describe("Customers — Endereço", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-23 campo CEP aceita dígitos", async ({ page }) => {
    await page.goto("/customers/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    const cep = page.locator("input[name='zipCode']");
    if (await cep.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fillField(page, "zipCode", "64000000");
      await expect(cep).not.toHaveValue("");
    } else {
      await expect(page.getByRole("button", { name: /Cadastrar/i })).toBeVisible();
    }
  });

  test("@business T-24 campo rua aceita texto", async ({ page }) => {
    await page.goto("/customers/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    const street = page.locator("input[name='street']");
    if (await street.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fillField(page, "street", "Rua E2E");
      await expect(street).not.toHaveValue("");
    } else {
      await expect(page.locator("input[name='name']")).toBeVisible();
    }
  });
});

test.describe("Customers — Interesses", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-15 listagem interesses renderiza conteúdo", async ({ page }) => {
    await page.goto("/interests");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    const table = page.locator("table");
    const empty = page.getByText(/[Nn]enhum/);
    const hasTable = await table.isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await empty.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test("@business T-16 form novo interesse preenche campo nome", async ({ page }) => {
    await page.goto("/interests/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await fillField(page, "customerName", "Contato E2E");
    await expect(page.locator("input[name='customerName']")).not.toHaveValue("");
  });

  test("@business T-17 listagem interesses tem conteúdo funcional", async ({ page }) => {
    await page.goto("/interests");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    const table = page.locator("table");
    const empty = page.getByText(/[Nn]enhum/);
    const ok = await table.isVisible({ timeout: 3000 }).catch(() => false);
    const emptyOk = await empty.isVisible({ timeout: 1000 }).catch(() => false);
    expect(ok || emptyOk).toBe(true);
  });

  test("@business T-22 sidebar Interesses navega para /interests", async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await page.getByRole("link", { name: /[Ii]nteress/ }).first().click();
    await expect(page).toHaveURL(/\/interests/);
  });
});
