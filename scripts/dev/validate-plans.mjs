/** Prova de uso dos planos: assistência recebe OS pelo PDV, varejo vende no balcão. */
import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const b = await chromium.launch();
const out = {};

async function checkPlan(email, label) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 120)));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForSelector('input[name="cpf"]', { timeout: 20000 });
  await page.fill('input[name="cpf"]', email);
  await page.fill('input[name="password"]', "Teste@1234");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(6000);

  const menu = await page.locator("nav, aside").first().innerText().catch(() => "");
  const nav = async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    return new URL(page.url()).pathname;
  };

  out[label] = {
    menuTemNovaVenda: menu.includes("PDV / Nova Venda"),
    menuTemOS: menu.includes("Ordens de Serviço"),
    menuTemConsultas: menu.includes("Consultas"),
    menuTemFiscal: menu.includes("Fiscal"),
    rotaPdv: await nav("/pdv"),
    rotaServiceOrders: await nav("/service-orders"),
    rotaImei: await nav("/imei"),
    rotaFiscal: await nav("/fiscal"),
    consoleErrors: errs.slice(0, 2),
  };
  await page.screenshot({ path: `/tmp/plano-${label}.png`, fullPage: false });
  await ctx.close();
}

await checkPlan("assistencia@teste.local", "assistencia");
await checkPlan("varejo@teste.local", "varejo");
await b.close();
console.log(JSON.stringify(out, null, 2));
