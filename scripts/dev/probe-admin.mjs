import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const b = await chromium.launch();
const ctx = await b.newContext();
const page = await ctx.newPage();
const net = [];
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/api/trpc/admin")) {
    net.push({ url: u.slice(0, 90), status: r.status(), location: r.headers()["location"] ?? null, ct: r.headers()["content-type"] ?? null });
  }
});
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForSelector('input[name="cpf"]', { timeout: 20000 });
await page.fill('input[name="cpf"]', "12345678909");
await page.fill('input[name="password"]', "Ar3naTech2026Super");
await page.click('button[type="submit"]');
await page.waitForTimeout(8000);
console.log("apos login:", new URL(page.url()).pathname);
const cookies = await ctx.cookies();
console.log("cookies:", cookies.map(c => c.name).join(", "));
await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
console.log(JSON.stringify(net, null, 2));
await b.close();
