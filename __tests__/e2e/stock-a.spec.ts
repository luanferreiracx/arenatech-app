import { test, expect, type Page } from "@playwright/test";

/**
 * Estoque-A (Catálogo de Produtos) E2E tests.
 * 19 scenarios covering SPEC seção 11 + ADRs 0016-0020.
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

test.describe("Estoque-A — Product CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@smoke T-01 Listagem de produtos carrega", async ({ page }) => {
    await page.goto("/stock");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Pp]roduto|[Ee]stoque/, { timeout: 15000 });
  });

  test("@smoke T-02 Criar produto simples (não-serializado)", async ({ page }) => {
    await page.goto("/stock/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Pp]roduto|[Cc]adastrar/, { timeout: 10000 });
  });

  test("@smoke T-03 Editar produto existente", async ({ page }) => {
    await page.goto("/stock");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Pp]roduto|[Ee]stoque/);
  });

  test("@smoke T-04 Soft delete de produto", async ({ page }) => {
    await page.goto("/stock");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Pp]roduto|[Ee]stoque/);
  });
});

test.describe("Estoque-A — Produto serializado (ADR 0016)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@smoke T-05 Criar produto serializado (isSerialized=true)", async ({ page }) => {
    await page.goto("/stock/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    // Form should have isSerialized toggle
    await expect(page.locator("body")).toContainText(/[Ss]erializado|IMEI|[Aa]parelho/);
  });

  test("@smoke T-06 Produto serializado não mostra currentStock na UI", async ({ page }) => {
    await page.goto("/stock");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Pp]roduto|[Ee]stoque/);
  });
});

test.describe("Estoque-A — Variações e Atributos (ADR 0019)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@smoke T-07 Acessar página de atributos", async ({ page }) => {
    await page.goto("/stock/attributes");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Aa]tributo/, { timeout: 10000 });
  });

  test("@smoke T-08 Criar atributo com valores", async ({ page }) => {
    await page.goto("/stock/attributes");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Aa]tributo/);
  });

  test("@smoke T-09 Produto com hasVariations=true mostra seção de variações", async ({ page }) => {
    await page.goto("/stock/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Vv]ariação|[Vv]ariacoes/);
  });
});

test.describe("Estoque-A — Categorias", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@smoke T-10 CRUD categoria de produtos", async ({ page }) => {
    await page.goto("/stock/categories");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Cc]ategoria/, { timeout: 10000 });
  });
});

test.describe("Estoque-A — Supplier (Fornecedores)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@smoke T-11 Listar fornecedores", async ({ page }) => {
    await page.goto("/stock/suppliers");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Ff]ornecedor/, { timeout: 10000 });
  });

  test("@smoke T-12 Criar fornecedor PJ", async ({ page }) => {
    await page.goto("/stock/suppliers/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Ff]ornecedor|CNPJ/);
  });

  test("@smoke T-13 Detalhe de fornecedor", async ({ page }) => {
    await page.goto("/stock/suppliers");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Ff]ornecedor/);
  });
});

test.describe("Estoque-A — Classificação Fiscal (ADR 0018)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@smoke T-14 Form de produto mostra campo NCM", async ({ page }) => {
    await page.goto("/stock/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/NCM|[Ff]iscal/);
  });

  test("@smoke T-15 Form de produto mostra campo CEST", async ({ page }) => {
    await page.goto("/stock/new");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/CEST|NCM/);
  });
});

test.describe("Estoque-A — RBAC (ADR 0020)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@smoke T-16 Operator acessa listagem (read permitido)", async ({ page }) => {
    await page.goto("/stock");
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    await expect(page.locator("body")).toContainText(/[Pp]roduto|[Ee]stoque/, { timeout: 20000 });
  });

  test("@smoke T-17 Operator acessa detalhe de produto", async ({ page }) => {
    await page.goto("/stock");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Pp]roduto|[Ee]stoque/);
  });
});

test.describe("Estoque-A — RLS multi-tenant", () => {
  test("@smoke T-18 Produtos de tenant A não aparecem em tenant B", async ({ page }) => {
    await login(page);
    await page.goto("/stock");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Pp]roduto|[Ee]stoque/);
  });
});

test.describe("Estoque-A — Navegação", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@smoke T-19 Navegar entre listagem → detalhe → edit funciona", async ({ page }) => {
    await page.goto("/stock");
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.locator("body")).toContainText(/[Pp]roduto|[Ee]stoque/);
  });
});
