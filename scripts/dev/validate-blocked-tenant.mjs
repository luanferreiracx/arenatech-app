/**
 * Prova de uso do bloqueio suave (ADR 0061): loga como dono de tenant suspenso e
 * verifica o que ele REALMENTE vê. Playwright já é dependência do projeto.
 */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const EMAIL = "bloqueado@teste.local";
const PASSWORD = "Bloqueado@123";

const browser = await chromium.launch();
const results = [];

for (const viewport of [{ width: 1440, height: 900, label: "desktop" }, { width: 390, height: 844, label: "mobile" }]) {
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="cpf"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const afterLogin = new URL(page.url()).pathname;

  // Tenta ir direto ao PDV (módulo pago) por URL.
  await page.goto(`${BASE}/pdv`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const afterPdv = new URL(page.url()).pathname;

  // Tenta a carteira DePix (deve continuar aberta).
  await page.goto(`${BASE}/depix-wallet`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const afterWallet = new URL(page.url()).pathname;

  await page.goto(`${BASE}/assinatura-bloqueada`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const heading = await page.locator("h1").first().textContent().catch(() => null);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const hasScrollX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  await page.screenshot({ path: `/tmp/bloqueio-${viewport.label}.png`, fullPage: true });

  results.push({
    viewport: viewport.label,
    afterLogin,
    afterPdv,
    afterWallet,
    heading,
    mostraPagar: bodyText.includes("Pagar e reativar"),
    mostraCarteira: bodyText.includes("carteira continua sua"),
    scrollHorizontal: hasScrollX,
    consoleErrors: consoleErrors.slice(0, 3),
  });
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
