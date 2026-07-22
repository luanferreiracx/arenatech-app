import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "__tests__/e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // ADR 0039: workers=2 em dev (evita flakiness Turbopack), 1 em CI (build pré-compilado)
  workers: CI ? 1 : 2,
  // Timeouts folgados no CI: na suíte completa o runner GitHub-hosted fica com
  // CPU faminta e requests lentos-porém-vivos estouravam o timeout padrão de
  // 30s — o Playwright matava a página e o fetch em voo virava "Failed to
  // fetch" (colateral). Dar folga faz a suíte tolerar a lentidão do runner.
  timeout: CI ? 90_000 : 30_000,
  expect: { timeout: CI ? 15_000 : 5_000 },
  reporter: "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    actionTimeout: CI ? 20_000 : 0,
    navigationTimeout: CI ? 45_000 : 0,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
