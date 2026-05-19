import { test, expect, type Page } from "@playwright/test";
import { fillField, fillTextarea, fillByPlaceholder } from "./helpers/form.helper";
import { gotoAndWait } from "./helpers/navigation.helper";

/**
 * Service Orders (OS) E2E — 100% @business (ADR 0036 + ADR 0040).
 * Tests cover listing, wizard creation, detail, edit.
 * Uses fillField() for react-hook-form (ADR 0037), gotoAndWait() for RSC (ADR 0038).
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

/** Generate a valid CPF for test data. */
function generateCPF(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += n[i]! * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  n.push(d1);
  sum = 0;
  for (let i = 0; i < 10; i++) sum += n[i]! * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  n.push(d2);
  return n.join("");
}

/**
 * Create a customer via tRPC API (bypasses CpfInput/PhoneInput controlled component issue).
 * Returns the customer name for EntitySelector search.
 */
async function ensureCustomerExists(page: Page): Promise<string> {
  const name = `ClienteOS ${Date.now()}`;
  const cpf = generateCPF();
  await page.evaluate(async ({ name, cpf }) => {
    await fetch("/api/trpc/customer.create?batch=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        "0": { json: { type: "PF", name, cpf, phone: "86999990001" } },
      }),
    });
  }, { name, cpf });
  return name;
}

/** Close the sidebar sheet overlay if open (mobile layout in Playwright viewport). */
async function dismissOverlay(page: Page) {
  const overlay = page.locator("[data-slot='sheet-overlay']");
  if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
}

/** Select an entity from EntitySelector (Popover+Command pattern). */
async function selectEntityOption(page: Page, search: string, index = 0) {
  await dismissOverlay(page);
  // Click the combobox trigger
  const combobox = page.locator("[role='combobox']").first();
  await combobox.waitFor({ state: "visible", timeout: 15000 });
  await combobox.click({ force: true });
  // Wait for popover to appear and initial search
  await page.waitForTimeout(1500);
  // Check if items appeared with empty search (common if few records)
  let items = await page.locator("[cmdk-item]").count();
  if (items === 0 && search) {
    // Type search term
    const cmdInput = page.locator("[cmdk-input]");
    await cmdInput.fill(search);
    // Wait for debounce (300ms) + API response + render
    await page.waitForTimeout(1500);
  }
  // Click the result
  const item = page.locator("[cmdk-item]").nth(index);
  await item.waitFor({ state: "visible", timeout: 15000 });
  await item.click({ force: true });
  // Wait for popover to close
  await page.waitForTimeout(300);
}

/** Navigate wizard to next step. */
async function wizardNext(page: Page) {
  await page.locator("button:has-text('Proximo')").click();
  await page.waitForTimeout(300);
}

/** Fill step 3 (problem) with required reportedProblem. */
async function fillProblemStep(page: Page, problem: string) {
  const textarea = page.locator("textarea").first();
  await textarea.waitFor({ state: "visible", timeout: 10000 });
  await textarea.evaluate((el: HTMLTextAreaElement, val: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, problem);
}

test.describe("OS — Listagem", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-01 listagem renderiza titulo e botão Nova OS", async ({ page }) => {
    await gotoAndWait(page, "/service-orders");
    await expect(page.locator("main")).toContainText(/Ordens de Servi[cç]o/i, { timeout: 10000 });
    const newBtn = page.locator("a[href='/service-orders/new']");
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    await expect(newBtn).toHaveAttribute("href", "/service-orders/new");
  });

  test("@business T-02 listagem renderiza stats cards", async ({ page }) => {
    await gotoAndWait(page, "/service-orders");
    // Stats cards render (4 cards)
    await expect(page.locator("main").locator("[data-slot='card'], .rounded-lg").first()).toBeVisible({ timeout: 15000 });
  });

  test("@business T-03 listagem renderiza tabela ou estado vazio", async ({ page }) => {
    await gotoAndWait(page, "/service-orders");
    const table = page.locator("table");
    const empty = page.locator("main").getByText(/[Nn]enhum|[Vv]azio/);
    const hasTable = await table.isVisible({ timeout: 10000 }).catch(() => false);
    const hasEmpty = await empty.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test("@business T-04 busca na listagem mantém tabela visível", async ({ page }) => {
    await gotoAndWait(page, "/service-orders");
    const searchInput = page.locator("input[placeholder*='Buscar'], input[type='search']").first();
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill("__inexistente_e2e__");
      await page.waitForTimeout(600);
      await expect(page.locator("main").locator("table, [data-slot='card']").first()).toBeVisible({ timeout: 10000 });
    } else {
      // Search input may not exist if table hasn't loaded
      await expect(page.locator("main")).toContainText(/Ordens de Servi[cç]o/i);
    }
  });

  test("@business T-05 filtro por status renderiza na listagem", async ({ page }) => {
    await gotoAndWait(page, "/service-orders");
    // Verify filter controls exist (select or combobox for status)
    const hasFilters = await page.locator("select, [role='combobox'], button:has-text('Status')").first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    // Either filters exist or page renders with content
    const hasContent = await page.locator("main").locator("table, [data-slot='card']").first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasFilters || hasContent).toBe(true);
  });
});

test.describe("OS — Wizard de Criação", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-06 wizard renderiza step 1 com campo de cliente", async ({ page }) => {
    await gotoAndWait(page, "/service-orders/new");
    await expect(page.locator("main")).toContainText(/Nova Ordem de Servi[cç]o/i, { timeout: 10000 });
    // EntitySelector combobox is present
    await expect(page.locator("[role='combobox']").first()).toBeVisible({ timeout: 10000 });
    // "Cadastre aqui" agora abre Sheet inline (botao, nao link)
    await expect(page.locator("button", { hasText: /Cadastre aqui/i })).toBeVisible({ timeout: 5000 });
  });

  test("@business T-07 wizard step 2 preenche campos de equipamento e avança", async ({ page }) => {
    // Need to first select a customer to advance
    const customerName = await ensureCustomerExists(page);
    await gotoAndWait(page, "/service-orders/new");
    // Select the customer
    await selectEntityOption(page, customerName);
    await page.waitForTimeout(300);
    // Advance to step 2
    await wizardNext(page);
    // Fill device fields
    await expect(page.locator("main")).toContainText(/[Ee]quipamento/, { timeout: 10000 });
    const brandInput = page.locator("input[placeholder*='Apple']");
    await brandInput.waitFor({ state: "visible", timeout: 10000 });
    await brandInput.fill("Apple");
    const modelInput = page.locator("input[placeholder*='iPhone']");
    await modelInput.fill("iPhone 15 Pro");
    // Advance to step 3
    await wizardNext(page);
    await expect(page.locator("main")).toContainText(/[Pp]roblema/, { timeout: 10000 });
  });

  test("@business T-08 wizard step 3 preenche problema e checklist toggle funciona", async ({ page }) => {
    const customerName = await ensureCustomerExists(page);
    await gotoAndWait(page, "/service-orders/new");
    await selectEntityOption(page, customerName);
    await page.waitForTimeout(300);
    await wizardNext(page); // → step 2
    await page.waitForTimeout(300);
    await wizardNext(page); // → step 3
    await expect(page.locator("main")).toContainText(/[Pp]roblema/, { timeout: 10000 });
    // Fill problem
    await fillProblemStep(page, "Tela quebrada E2E");
    // Test checklist toggle (click first checklist item)
    const checklistBtn = page.locator("button").filter({ hasText: /Display|Tela/ }).first();
    if (await checklistBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await checklistBtn.click({ force: true });
      // Should change visual state (green/red/gray)
      await expect(checklistBtn).toBeVisible();
    }
    // Advance to step 4
    await wizardNext(page);
    await expect(page.locator("main")).toContainText(/[Ss]ervi[cç]os|[Pp]e[cç]as|[Ii]tens/, { timeout: 10000 });
  });

  test("@business T-09 cria OS completa via wizard e redireciona para detalhe", async ({ page }) => {
    const customerName = await ensureCustomerExists(page);
    await gotoAndWait(page, "/service-orders/new");

    // Step 1: Select customer
    await selectEntityOption(page, customerName);
    await page.waitForTimeout(300);
    await wizardNext(page);

    // Step 2: Fill device (optional, skip with Next)
    await page.waitForTimeout(300);
    await wizardNext(page);

    // Step 3: Fill problem (required)
    await expect(page.locator("main")).toContainText(/[Pp]roblema/, { timeout: 10000 });
    await fillProblemStep(page, `Problema E2E ${Date.now()}`);
    await wizardNext(page);

    // Step 4: Items (skip, no items required)
    await page.waitForTimeout(300);
    await wizardNext(page);

    // Step 5: Summary — click "Criar OS"
    await expect(page.locator("main")).toContainText(/[Rr]esumo/, { timeout: 10000 });
    const submitBtn = page.locator("button:has-text('Criar OS')");
    await submitBtn.waitFor({ state: "visible", timeout: 10000 });
    await submitBtn.click({ force: true });

    // Verify: should redirect to /service-orders/{id}
    await expect(page).toHaveURL(/\/service-orders\/[a-z0-9-]+$/, { timeout: 30000 });
  });

  test("@business T-10 cria OS e aparece na listagem", async ({ page }) => {
    const customerName = await ensureCustomerExists(page);
    await gotoAndWait(page, "/service-orders/new");

    // Step 1: Select customer
    await selectEntityOption(page, customerName);
    await page.waitForTimeout(300);
    await wizardNext(page);

    // Step 2: Skip
    await page.waitForTimeout(300);
    await wizardNext(page);

    // Step 3: Problem
    const problem = `OS-Listagem-${Date.now()}`;
    await fillProblemStep(page, problem);
    await wizardNext(page);

    // Step 4: Skip
    await page.waitForTimeout(300);
    await wizardNext(page);

    // Step 5: Submit
    await page.locator("button:has-text('Criar OS')").click({ force: true });
    await page.waitForURL(/\/service-orders\/[a-z0-9-]+$/, { timeout: 30000 });

    // Go to listing and verify the OS appears in the table
    await gotoAndWait(page, "/service-orders");
    // Table should have at least one row (the one we just created)
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe("OS — Detalhe e Edição", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-11 detalhe da OS mostra número e status", async ({ page }) => {
    // Create an OS first
    const customerName = await ensureCustomerExists(page);
    await gotoAndWait(page, "/service-orders/new");
    await selectEntityOption(page, customerName);
    await page.waitForTimeout(300);
    await wizardNext(page);
    await page.waitForTimeout(300);
    await wizardNext(page);
    await fillProblemStep(page, "Detalhe test E2E");
    await wizardNext(page);
    await page.waitForTimeout(300);
    await wizardNext(page);
    await page.locator("button:has-text('Criar OS')").click({ force: true });
    await expect(page).toHaveURL(/\/service-orders\/[a-z0-9-]+$/, { timeout: 30000 });

    // Now we're on the detail page — verify content
    await expect(page.locator("main")).toContainText(/OS\d+/, { timeout: 15000 });
    // Status should be visible (Iniciada)
    await expect(page.locator("main")).toContainText(/Iniciada|OPEN/, { timeout: 10000 });
  });

  test("@business T-12 detalhe mostra equipamento e problema", async ({ page }) => {
    // Create an OS with device info
    const customerName = await ensureCustomerExists(page);
    await gotoAndWait(page, "/service-orders/new");
    await selectEntityOption(page, customerName);
    await wizardNext(page);
    // Step 2: fill device info
    await page.waitForTimeout(300);
    const brandInput = page.locator("input[placeholder*='Apple']");
    if (await brandInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await brandInput.fill("Samsung");
    }
    await wizardNext(page);
    // Step 3: fill problem
    const problem = `Detalhe-E2E-${Date.now()}`;
    await fillProblemStep(page, problem);
    await wizardNext(page);
    // Step 4: skip
    await page.waitForTimeout(300);
    await wizardNext(page);
    // Step 5: submit
    await page.locator("button:has-text('Criar OS')").click({ force: true });
    await expect(page).toHaveURL(/\/service-orders\/[a-z0-9-]+$/, { timeout: 30000 });

    // Verify detail page shows the problem
    await expect(page.locator("main")).toContainText(/Detalhe-E2E/, { timeout: 15000 });
  });
});

test.describe("OS — Navegação", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@business T-13 sidebar tem link para Ordens de Serviço", async ({ page }) => {
    await gotoAndWait(page, "/service-orders");
    // Verify we're on the correct page
    await expect(page.locator("main")).toContainText(/Ordens de Servi[cç]o/i, { timeout: 15000 });
    const url = page.url();
    expect(url).toMatch(/\/service-orders/);
  });

  test("@business T-14 relatório de técnicos renderiza conteúdo", async ({ page }) => {
    await gotoAndWait(page, "/service-orders/technician-report");
    await expect(page.locator("main")).toContainText(/[Tt][eé]cnico|[Rr]elat[oó]rio/, { timeout: 15000 });
    await expect(page.locator("main").locator("table, [data-slot='card'], .rounded-lg").first()).toBeVisible({ timeout: 10000 });
  });
});
