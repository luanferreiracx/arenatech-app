import type { Page } from "@playwright/test";

// Seed credentials from prisma/seed.ts
export const USERS = {
  operator: { cpf: "52998224725", password: "Arena@2026" }, // single-tenant operator
  manager: { cpf: "11144477735", password: "Multi@2026" }, // multi-tenant (has manager role)
  owner: { cpf: "12345678909", password: "Ar3naTech2026Super" }, // super admin (owner-level)
};

/**
 * Login as a specific role.
 */
export async function loginAs(page: Page, role: "operator" | "manager" | "owner") {
  const creds = USERS[role];
  await page.goto("/login");
  const cpfInput = page.getByLabel("CPF");
  await cpfInput.click();
  await cpfInput.fill(creds.cpf);
  await page.getByLabel("Senha").fill(creds.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(dashboard|select-tenant|cashier)/, { timeout: 10000 });
}

/**
 * Navigate to cashier panel.
 */
export async function goToCashier(page: Page) {
  await page.goto("/cashier");
  await page.waitForLoadState("networkidle");
}

/**
 * Open a cash session via UI.
 */
export async function openCashSessionUI(page: Page, initialBalance: string = "0", note?: string) {
  await goToCashier(page);
  // Look for "Abrir" button or form
  const openButton = page.getByRole("button", { name: /Abrir/i });
  if (await openButton.isVisible()) {
    await openButton.click();
  }
  // Fill balance
  const balanceInput = page.getByLabel(/saldo|balance/i).first();
  if (await balanceInput.isVisible()) {
    await balanceInput.fill(initialBalance);
  }
  if (note) {
    const noteInput = page.getByLabel(/observ|note/i).first();
    if (await noteInput.isVisible()) {
      await noteInput.fill(note);
    }
  }
  // Submit
  const submitBtn = page.getByRole("button", { name: /Abrir|Confirmar/i });
  await submitBtn.click();
  await page.waitForLoadState("networkidle");
}
