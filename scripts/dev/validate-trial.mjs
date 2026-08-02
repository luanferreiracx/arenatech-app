/** Prova de uso do teste grátis (ADR 0061): admin e cliente, desktop e mobile. */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const out = {};

async function login(page, id, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForSelector('input[name="cpf"]', { timeout: 20000 });
  await page.fill('input[name="cpf"]', id);
  await page.fill('input[name="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(6000);
}

// ── Cliente em teste ──
for (const vp of [{ width: 1440, height: 900, label: "desktop" }, { width: 390, height: 844, label: "mobile" }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));

  await login(page, "trial@teste.local", "Trial@1234");
  await page.goto(`${BASE}/settings/subscription`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const body = await page.locator("body").innerText().catch(() => "");
  await page.screenshot({ path: `/tmp/trial-cliente-${vp.label}.png`, fullPage: true });

  out[`cliente-${vp.label}`] = {
    url: new URL(page.url()).pathname,
    badgeEmTeste: body.includes("Em teste"),
    rotuloTesteTermina: body.includes("Teste termina em"),
    avisoDeTeste: body.includes("período de teste"),
    botaoAtivar: body.includes("Ativar plano agora"),
    naoDizVencida: !body.includes("vencida há"),
    scrollX: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1),
    consoleErrors: errs.slice(0, 3),
  };
  // PDV liberado durante o teste (o trial concede os módulos do plano).
  await page.goto(`${BASE}/pdv`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  out[`cliente-${vp.label}`].pdvLiberado = new URL(page.url()).pathname === "/pdv";
  await ctx.close();
}

// ── Superadmin ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));

  await login(page, process.env.SU_ID, process.env.SU_PASS);
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const dash = await page.locator("body").innerText().catch(() => "");
  await page.screenshot({ path: "/tmp/trial-admin-dashboard.png", fullPage: true });

  await page.goto(`${BASE}/admin/tenants/${process.env.TRIAL_TENANT_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const detail = await page.locator("body").innerText().catch(() => "");
  await page.screenshot({ path: "/tmp/trial-admin-tenant.png", fullPage: true });

  out.admin = {
    dashboardCardTeste: dash.includes("Em teste grátis"),
    dashboardConfigTeste: dash.includes("Dias por padrão"),
    detalheEstender: detail.includes("Estender teste"),
    detalheTesteTermina: detail.includes("Teste termina em"),
    consoleErrors: errs.slice(0, 3),
  };
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(out, null, 2));
