import { test, expect } from "@playwright/test";

test("homepage shows olá", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("olá")).toBeVisible();
});
