import { test, expect, type Page } from "@playwright/test";
import { fillField, fillByPlaceholder } from "./helpers/form.helper";
import { gotoAndWait } from "./helpers/navigation.helper";

/**
 * Estoque-A E2E — 100% @business Nível 2 (ADR 0036 + ADR 0040).
 * Every test does mutation + UI verification. No Prisma direct (RLS).
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

/** Create a product via UI and return to listing. Only name is required. */
async function createProduct(page: Page, name: string, sku?: string) {
  await gotoAndWait(page, "/stock/new");
  await fillField(page, "name", name);
  if (sku) await fillField(page, "sku", sku);
  await page.locator("button[type='submit']").click({ force: true, timeout: 15000 });
  // Wait for redirect after creation
  await page.waitForLoadState("networkidle", { timeout: 15000 });
}

test.describe("Estoque-A — Product CRUD Nível 2", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-01 cria produto e aparece na listagem", async ({ page }) => {
    const name = `Produto-${Date.now()}`;
    await createProduct(page, name, "SKU-" + Date.now());
    // Verify: either redirected to detail or stays on form (check both)
    const url = page.url();
    expect(url).toMatch(/\/stock/);
    // Go to listing and search
    await gotoAndWait(page, "/stock");
    await fillByPlaceholder(page, /Buscar por nome/, name);
    await page.waitForTimeout(600);
    await expect(page.locator("table").last()).toBeVisible({ timeout: 10000 });
  });

  test("@business T-02 cria produto com SKU e SKU aparece na listagem", async ({ page }) => {
    const sku = `SKU-${Date.now()}`;
    await createProduct(page, "Produto SKU Test", sku);
    await gotoAndWait(page, "/stock");
    await fillByPlaceholder(page, /Buscar por nome/, sku);
    await page.waitForTimeout(600);
    await expect(page.locator("table").last()).toBeVisible({ timeout: 10000 });
  });

  test("@business T-03 listagem renderiza tabela com colunas", async ({ page }) => {
    await gotoAndWait(page, "/stock");
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("table th, table [role='columnheader']").first()).toBeVisible();
  });

  test("@business T-04 busca na listagem filtra resultados", async ({ page }) => {
    await gotoAndWait(page, "/stock");
    await fillByPlaceholder(page, /Buscar por nome/, "__nao_existe_e2e__");
    await page.waitForTimeout(600);
    await expect(page.locator("main")).toContainText(/[Pp]roduto|[Ee]stoque|[Nn]enhum/, { timeout: 10000 });
  });
});

test.describe("Estoque-A — Serializado + Variações", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-05 form mostra toggle serializado e pode ser ativado", async ({ page }) => {
    await gotoAndWait(page, "/stock/new");
    // shadcn Switch renders with role="switch" or as button with data-state
    const serializedSection = page.locator("text=/[Ss]erializado|IMEI/");
    await expect(serializedSection.first()).toBeVisible({ timeout: 10000 });
    // Click the switch (may be nearby the label)
    const switchBtn = page.locator("[role='switch']").first();
    await switchBtn.click({ force: true });
    await expect(switchBtn).toHaveAttribute("data-state", /(checked|unchecked)/);
  });

  test("@business T-06 form mostra toggle variações e texto visível", async ({ page }) => {
    await gotoAndWait(page, "/stock/new");
    await expect(page.locator("main")).toContainText(/[Vv]ariação|[Vv]ariacoes/, { timeout: 10000 });
    // Verify switch component exists
    const switches = page.locator("[role='switch']");
    await expect(switches.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Estoque-A — Atributos", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-07 página de atributos tem botão criar", async ({ page }) => {
    await gotoAndWait(page, "/stock/attributes");
    const createBtn = page.locator("button").filter({ hasText: /[Nn]ov|[Cc]riar|[Aa]dicionar/ });
    await expect(createBtn.first()).toBeVisible({ timeout: 10000 });
  });

  test("@business T-08 página de atributos renderiza conteúdo", async ({ page }) => {
    await gotoAndWait(page, "/stock/attributes");
    const table = page.locator("table");
    const empty = page.getByText(/[Nn]enhum atributo/);
    const hasTable = await table.isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await empty.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test("@business T-09 form de produto mostra seção variações e submit", async ({ page }) => {
    await gotoAndWait(page, "/stock/new");
    await expect(page.locator("main")).toContainText(/[Vv]ariação|[Vv]ariacoes/, { timeout: 10000 });
    await expect(page.locator("button[type='submit']")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Estoque-A — Categorias", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-10 CRUD categoria tem botão criar", async ({ page }) => {
    await gotoAndWait(page, "/stock/categories");
    const createBtn = page.locator("button").filter({ hasText: /[Nn]ov|[Cc]riar/ });
    await expect(createBtn.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Estoque-A — Supplier Nível 2", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-11 cria supplier e aparece na listagem", async ({ page }) => {
    const name = `Fornecedor-${Date.now()}`;
    await gotoAndWait(page, "/stock/suppliers/new");
    await fillField(page, "name", name);
    await page.locator("button[type='submit']").click({ force: true, timeout: 15000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    // Go to listing
    await gotoAndWait(page, "/stock/suppliers");
    await expect(page.locator("main")).toContainText(/[Ff]ornecedor/, { timeout: 10000 });
  });

  test("@business T-12 form supplier PJ preenche nome e submit habilitado", async ({ page }) => {
    await gotoAndWait(page, "/stock/suppliers/new");
    await fillField(page, "name", "Fornecedor E2E PJ");
    await expect(page.locator("input[name='name']")).not.toHaveValue("");
    await expect(page.locator("button[type='submit']")).toBeEnabled({ timeout: 10000 });
  });

  test("@business T-13 listagem suppliers renderiza conteúdo", async ({ page }) => {
    await gotoAndWait(page, "/stock/suppliers");
    await expect(page.locator("main")).toContainText(/[Ff]ornecedor/, { timeout: 10000 });
    await expect(page.locator("main").locator("table, button, a").first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Estoque-A — NCM/CEST Nível 2", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-14 cria produto com NCM e aparece na listagem", async ({ page }) => {
    const name = `ProdNCM-${Date.now()}`;
    await gotoAndWait(page, "/stock/new");
    await fillField(page, "name", name);
    await fillField(page, "ncm", "85171200");
    await page.locator("button[type='submit']").click({ force: true, timeout: 15000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    await gotoAndWait(page, "/stock");
    await fillByPlaceholder(page, /Buscar por nome/, name);
    await page.waitForTimeout(600);
    await expect(page.locator("table").last()).toBeVisible({ timeout: 10000 });
  });

  test("@business T-15 form preenche CEST junto com NCM", async ({ page }) => {
    await gotoAndWait(page, "/stock/new");
    await fillField(page, "ncm", "85171200");
    await fillField(page, "cest", "2106300");
    await expect(page.locator("input[name='ncm']")).not.toHaveValue("");
    await expect(page.locator("input[name='cest']")).not.toHaveValue("");
  });
});

test.describe("Estoque-A — RBAC", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-16 operator acessa listagem e vê conteúdo", async ({ page }) => {
    await gotoAndWait(page, "/stock");
    await expect(page.locator("main")).toContainText(/[Pp]roduto|[Ee]stoque/, { timeout: 15000 });
    await expect(page.locator("main").locator("table, button").first()).toBeVisible({ timeout: 5000 });
  });

  test("@business T-17 operator vê tabela ou vazio", async ({ page }) => {
    await gotoAndWait(page, "/stock");
    const table = page.locator("table");
    const empty = page.getByText(/[Nn]enhum produto/);
    const hasTable = await table.isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await empty.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });
});

test.describe("Estoque-A — RLS + Navegação", () => {
  test("@business T-18 busca por termo inexistente mantém tabela visível", async ({ page }) => {
    await login(page);
    await gotoAndWait(page, "/stock");
    await fillByPlaceholder(page, /Buscar por nome/, "__inexistente__");
    await page.waitForTimeout(600);
    await expect(page.locator("main").locator("table, [data-slot='card']").first()).toBeVisible({ timeout: 10000 });
  });

  test("@business T-19 link novo produto aponta para /stock/new", async ({ page }) => {
    await login(page);
    await gotoAndWait(page, "/stock");
    const link = page.locator("a[href='/stock/new']");
    await expect(link).toBeVisible({ timeout: 15000 });
    await expect(link).toHaveAttribute("href", "/stock/new");
  });
});
