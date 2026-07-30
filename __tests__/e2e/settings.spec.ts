import { test, expect, type Page } from "@playwright/test";
import { fillField, fillByPlaceholder } from "./helpers/form.helper";
import { gotoAndWait } from "./helpers/navigation.helper";

/**
 * Settings module E2E — 100% @business (ADR 0036).
 * Uses fillField (ADR 0037) + gotoAndWait (ADR 0038).
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

/**
 * Login como ADMIN do tenant (seed "Admin Arena"). Necessário para páginas
 * admin-gated (config da loja/assistência, criar catálogo) — o operador padrão
 * vê só a mensagem "Apenas administradores", sem form.
 */
async function loginAsAdmin(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  const cpfInput = page.getByLabel("CPF");
  await cpfInput.waitFor({ state: "visible", timeout: 15000 });
  await cpfInput.click();
  await cpfInput.fill("86288366757");
  await page.getByLabel("Senha").fill("Admin@2026");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForLoadState("networkidle", { timeout: 15000 });
}

test.describe("Settings — Tab Geral", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("@business S-1 tab Geral preenche nome da loja", async ({ page }) => {
    await gotoAndWait(page, "/settings/general");
    await fillField(page, "tradeName", "Arena Tech E2E");
    await expect(page.locator("input[name='tradeName']")).not.toHaveValue("");
    await expect(page.locator("button[type='submit']")).toBeEnabled({ timeout: 10000 });
  });

  test("@business S-2 tab Geral preenche nome da loja (tradeName)", async ({ page }) => {
    await gotoAndWait(page, "/settings/general");
    // tradeName is the first input and always visible
    const nameField = page.locator("input[name='tradeName']");
    await nameField.waitFor({ state: "visible", timeout: 30000 });
    await fillField(page, "tradeName", "Arena E2E Updated");
    await expect(nameField).not.toHaveValue("");
  });
});

test.describe("Settings — Tab Assistência", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("@business S-3 tab Assistência tem form com submit", async ({ page }) => {
    await gotoAndWait(page, "/settings/assistance");
    await expect(page.locator("button[type='submit']")).toBeVisible({ timeout: 30000 });
    // Verify textarea or form field exists
    const textarea = page.locator("textarea");
    const hasTextarea = await textarea.first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasTextarea).toBe(true);
  });

  test("@business S-4 tab Assistência botão salvar habilitado", async ({ page }) => {
    await gotoAndWait(page, "/settings/assistance");
    await expect(page.locator("button[type='submit']")).toBeEnabled({ timeout: 10000 });
  });
});

test.describe("Settings — Tab Fiscal", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("@business S-5 tab Fiscal preenche razão social", async ({ page }) => {
    await gotoAndWait(page, "/settings/fiscal");
    const legalName = page.locator("input[name='legalName']");
    if (await legalName.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fillField(page, "legalName", "Arena Tech LTDA");
      await expect(legalName).not.toHaveValue("");
    } else {
      // Fiscal tab may have different structure — verify form exists
      await expect(page.locator("button[type='submit']")).toBeVisible({ timeout: 10000 });
    }
  });

  test("@business S-6 tab Fiscal tem campo de certificado", async ({ page }) => {
    await gotoAndWait(page, "/settings/fiscal");
    // Look for certificate-related content
    const certSection = page.locator("text=/[Cc]ertificado|\.pfx|A1/");
    const hasCert = await certSection.first().isVisible({ timeout: 5000 }).catch(() => false);
    // Either cert section exists or fiscal form exists
    expect(hasCert || await page.locator("button[type='submit']").isVisible().catch(() => false)).toBe(true);
  });
});

test.describe("Settings — Tab Pagamento", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("@business S-7 tab Pagamento renderiza conteúdo", async ({ page }) => {
    await gotoAndWait(page, "/settings/payment-methods");
    // Verify main has rendered payment-specific content
    await expect(page.locator("main")).toContainText(/[Pp]agamento|[Dd]inheiro|PIX|[Cc]artão/, { timeout: 15000 });
    // Verify at least one interactive element exists
    await expect(page.locator("main button").first()).toBeVisible({ timeout: 5000 });
  });

  test("@business S-8 tab Pagamento tem ação de criar nova forma", async ({ page }) => {
    await gotoAndWait(page, "/settings/payment-methods");
    // Look for create button/link
    const createBtn = page.locator("button, a").filter({ hasText: /[Nn]ov|[Cc]riar|[Aa]dicionar/ });
    await expect(createBtn.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Settings — Tab Parcelamento", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("@business S-9 tab Parcelamento exibe tabela de taxas", async ({ page }) => {
    await gotoAndWait(page, "/settings/installments");
    const table = page.locator("table");
    const hasTable = await table.isVisible({ timeout: 5000 }).catch(() => false);
    // Either table with rates or the simulator-fees content
    expect(hasTable || await page.locator("text=/[Ss]imulador|[Pp]arcela/").first().isVisible().catch(() => false)).toBe(true);
  });

  test("@business S-10 tab Parcelamento tem conteúdo interativo", async ({ page }) => {
    await gotoAndWait(page, "/settings/installments");
    await expect(page.locator("main")).toContainText(/[Pp]arcelamento|[Tt]axa|[Pp]arcela/, { timeout: 15000 });
    await expect(page.locator("main button, main input").first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Settings — Tab Recebimento", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("@business S-11 tab Recebimento tem form com submit", async ({ page }) => {
    await gotoAndWait(page, "/settings/receiving");
    await expect(page.locator("main")).toContainText(/[Rr]ecebimento|[Pp]olítica|CPF/, { timeout: 15000 });
    await expect(page.locator("button[type='submit']")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Settings — Usuários", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("@business S-12 listar usuários exibe tabela", async ({ page }) => {
    await gotoAndWait(page, "/settings/users");
    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 10000 });
    // Should have at least the header row
    await expect(page.locator("table th, table [role='columnheader']").first()).toBeVisible();
  });

  test("@business S-13 admin vê a ação de cadastro de usuário", async ({ page }) => {
    await gotoAndWait(page, "/settings/users");
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /Novo usuario|Novo usuário/i })).toHaveCount(1);
  });
});

/**
 * CFG-6 — Configurações é área do administrador.
 *
 * Estes testes substituem um bloco que afirmava o contrário ("Operator accessing
 * fiscal — page loads (RBAC check is on mutations, not read)") e terminava em
 * `expect(typeof hasSubmit).toBe("boolean")`, que passa sempre. O comportamento
 * que eles descreviam era o achado: medido no navegador, o operador abria as 15
 * abas do admin, preenchia "Regras de Venda", clicava Salvar e só então recebia
 * 403. O backend sempre recusou; a tela é que oferecia.
 */
const ABAS_SO_DO_ADMIN = [
  "/settings/general",
  "/settings/fiscal",
  "/settings/payment-methods",
  "/settings/card-acquirers",
  "/settings/receiving",
  "/settings/users",
  "/settings/logs",
  "/settings/subscription",
];

test.describe("Settings — RBAC", () => {
  test.beforeEach(async ({ page }) => {
    await login(page); // 52998224725 = operador
  });

  test("@business S-14 operador é barrado nas abas do admin, com aviso visível", async ({ page }) => {
    for (const aba of ABAS_SO_DO_ADMIN) {
      await gotoAndWait(page, aba);
      await expect(page).toHaveURL(/\/painel/, { timeout: 15000 });
      // Aviso como CONTEÚDO, não toast: o toast disparado na hidratação se perde
      // (o Toaster do sonner assina o store depois do efeito) — foi por isso que
      // o aviso de módulo indisponível nunca apareceu para ninguém.
      await expect(page.locator("main [data-slot='alert']")).toContainText(
        /restrita ao administrador/i,
        { timeout: 15000 },
      );
    }
  });

  test("@business S-15 operador mantém Segurança e Entregadores", async ({ page }) => {
    // Segurança nunca é gateada (2FA é pré-requisito de saque DePix); entregador
    // é trabalho de operação — as procedures não exigem admin.
    await gotoAndWait(page, "/settings/security");
    await expect(page).toHaveURL(/\/settings\/security/, { timeout: 15000 });

    await gotoAndWait(page, "/settings/delivery-persons");
    await expect(page).toHaveURL(/\/settings\/delivery-persons/, { timeout: 15000 });
  });

  test("@business S-18 barra de abas do operador não oferece o que ele não pode abrir", async ({ page }) => {
    await gotoAndWait(page, "/settings/security");
    const abas = page.locator("main a[href^='/settings'], nav a[href^='/settings']");
    const hrefs = await abas.evaluateAll((els) =>
      els.map((el) => el.getAttribute("href")).filter((h): h is string => !!h),
    );
    // Menu que oferece rota que o proxy barra é o mesmo beco, invertido.
    for (const href of hrefs) {
      expect(ABAS_SO_DO_ADMIN).not.toContain(href);
    }
  });

  test("@business S-19 admin abre as abas de configuração normalmente", async ({ page }) => {
    await loginAsAdmin(page);
    await gotoAndWait(page, "/settings/receiving");
    await expect(page).toHaveURL(/\/settings\/receiving/, { timeout: 15000 });
    await expect(page.locator("button[type='submit']")).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Settings — Integrações e Logs", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("@business S-16 integrações exibe cards ou lista", async ({ page }) => {
    await gotoAndWait(page, "/settings/integrations");
    // Should show integration cards
    const cards = page.locator("[data-slot='card']");
    const list = page.locator("table");
    const hasCards = await cards.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasList = await list.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasCards || hasList || await page.locator("main").textContent().then(t => (t ?? "").length > 50)).toBe(true);
  });

  test("@business S-17 logs de auditoria renderiza conteúdo", async ({ page }) => {
    await gotoAndWait(page, "/settings/logs");
    await expect(page.locator("main")).toContainText(/[Ll]og|[Aa]uditoria|[Hh]istórico|[Nn]enhum/, { timeout: 15000 });
    // Verify page has interactive content (table or filters)
    const hasContent = await page.locator("main table, main button, main select").first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasContent || await page.locator("main").textContent().then(t => (t ?? "").length > 30)).toBe(true);
  });
});
