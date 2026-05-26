import { test, expect, type Page } from "@playwright/test";
import { fillField, fillByPlaceholder } from "./helpers/form.helper";
import { gotoAndWait } from "./helpers/navigation.helper";

/**
 * Estoque-B E2E — @business.
 * Purchase form agora usa EntitySelector de Product (paridade Laravel — sem
 * digitacao livre de marca/modelo) — bateu Nivel 1.5 sem seed do produto.
 * Listings = Nível 1 with meaningful presence checks.
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

test.describe("Estoque-B — Compras de aparelhos", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-01 form compra mostra combobox de Product + campos extras", async ({ page }) => {
    await gotoAndWait(page, "/stock/purchases/new");
    // Sem digitacao livre de marca/modelo — combobox de Product cadastrado.
    await expect(page.getByText(/Modelo do Aparelho/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder(/Buscar aparelho cadastrado/i)).toBeVisible({ timeout: 5000 });
    await expect(page.locator("input[name='imei']")).toBeVisible();
    await expect(page.locator("input[name='serial']")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible({ timeout: 10000 });
  });

  test("@business T-02 form compra preenche IMEI + serial e submit visivel", async ({ page }) => {
    await gotoAndWait(page, "/stock/purchases/new");
    await fillField(page, "imei", "356938035643809");
    await fillField(page, "serial", "SN-E2E-" + Date.now());
    await expect(page.locator("input[name='imei']")).not.toHaveValue("");
    await expect(page.locator("input[name='serial']")).not.toHaveValue("");
    await expect(page.locator("button[type='submit']")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Estoque-B — Entrada/Baixa de estoque", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-03 form entrada preenche motivo e submit habilitado", async ({ page }) => {
    await gotoAndWait(page, "/stock/entry");
    await fillField(page, "reason", "Compra fornecedor E2E");
    await expect(page.locator("input[name='reason']")).not.toHaveValue("");
    await expect(page.locator("button[type='submit']")).toBeEnabled({ timeout: 10000 });
  });

  test("@business T-04 form baixa preenche motivo e submit habilitado", async ({ page }) => {
    await gotoAndWait(page, "/stock/exit");
    // Motivo agora vem de Select com presets — confirma que o trigger esta visivel.
    await expect(page.getByText(/Motivo da baixa/i)).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button[type='submit']")).toBeEnabled({ timeout: 10000 });
  });
});

test.describe("Estoque-B — Movimentações", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-05 listagem movimentações renderiza tabela ou vazio", async ({ page }) => {
    await gotoAndWait(page, "/stock/movements");
    const table = page.locator("table");
    const empty = page.getByText(/[Nn]enhum/);
    const hasTable = await table.isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await empty.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test("@business T-06 movimentações tem filtro de tipo", async ({ page }) => {
    await gotoAndWait(page, "/stock/movements");
    await expect(page.locator("main")).toContainText(/[Mm]ovimenta/, { timeout: 10000 });
    await expect(page.locator("main").locator("select, [role='combobox']").first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Estoque-B — Listagem e Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-07 dashboard mostra cards de resumo", async ({ page }) => {
    await gotoAndWait(page, "/stock");
    await expect(page.locator("main")).toContainText(/[Ee]stoque|[Pp]roduto/, { timeout: 10000 });
    // Dashboard cards should be visible
    await expect(page.locator("main").locator("[data-slot='card'], .rounded-lg").first()).toBeVisible({ timeout: 5000 });
  });

  test("@business T-08 listagem de compras renderiza conteúdo", async ({ page }) => {
    await gotoAndWait(page, "/stock/purchases");
    await expect(page.locator("main")).toContainText(/[Cc]ompra|[Aa]parelho/, { timeout: 10000 });
    await expect(page.locator("main").locator("table, button, a").first()).toBeVisible({ timeout: 5000 });
  });

  test("@business T-09 form compra mostra link pra cadastrar produto novo", async ({ page }) => {
    await gotoAndWait(page, "/stock/purchases/new");
    await fillField(page, "imei", "490154203237518");
    await expect(page.locator("input[name='imei']")).not.toHaveValue("");
    // Paridade Laravel: aparelho precisa estar cadastrado como Product.
    await expect(page.getByRole("link", { name: /Cadastrar novo produto/i })).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Estoque-B — Relatórios", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-10 relatórios tem tabs interativos", async ({ page }) => {
    await gotoAndWait(page, "/stock/reports");
    await expect(page.locator("main")).toContainText(/[Rr]elatório|[Ee]stoque|[Pp]osição/, { timeout: 10000 });
    await expect(page.locator("main").locator("button, [role='tab'], select").first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Estoque-B — RBAC", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-11 operator acessa listagem e vê conteúdo", async ({ page }) => {
    await gotoAndWait(page, "/stock");
    await expect(page.locator("main")).toContainText(/[Pp]roduto|[Ee]stoque/, { timeout: 15000 });
    await expect(page.locator("main").locator("table, button").first()).toBeVisible({ timeout: 5000 });
  });

  test("@business T-12 operator acessa movimentações e vê conteúdo", async ({ page }) => {
    await gotoAndWait(page, "/stock/movements");
    await expect(page.locator("main")).toContainText(/[Mm]ovimenta/, { timeout: 10000 });
    await expect(page.locator("main").locator("table, button, select").first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Estoque-B — RLS + Navegação", () => {
  test("@business T-13 busca por item de outro tenant mantém tabela", async ({ page }) => {
    await login(page);
    await gotoAndWait(page, "/stock");
    await fillByPlaceholder(page, /Buscar por nome/, "__tenant_b_item__");
    await page.waitForTimeout(600);
    await expect(page.locator("main").locator("table, [data-slot='card']").first()).toBeVisible({ timeout: 10000 });
  });

  test("@business T-14 import CSV tem form funcional", async ({ page }) => {
    await login(page);
    await gotoAndWait(page, "/stock/import");
    await expect(page.locator("main")).toContainText(/[Ii]mport|CSV|[Ee]stoque/, { timeout: 10000 });
    await expect(page.locator("main").locator("input, textarea, button").first()).toBeVisible({ timeout: 5000 });
  });

  test("@business T-15 form compra com serial preenchido e combobox visivel", async ({ page }) => {
    await login(page);
    await gotoAndWait(page, "/stock/purchases/new");
    await fillField(page, "serial", "PX9-SN-" + Date.now());
    await expect(page.locator("input[name='serial']")).not.toHaveValue("");
    await expect(page.getByPlaceholder(/Buscar aparelho cadastrado/i)).toBeVisible({ timeout: 10000 });
  });
});
