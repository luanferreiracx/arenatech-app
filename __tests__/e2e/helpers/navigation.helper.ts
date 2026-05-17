import type { Page } from "@playwright/test";

/**
 * Navigate to a URL and wait for RSC streaming to complete.
 *
 * Problem: Next.js 16 + Turbopack compiles Server Components on-demand.
 * Layout (sidebar) renders immediately, but {children} stays pending
 * while the chunk compiles. Playwright evaluates the DOM before streaming
 * finishes — selectors for form/heading/button inside main are not found.
 *
 * waitForLoadState("networkidle") does NOT work — RSC keeps the connection
 * open during streaming.
 *
 * Solution: wait until something appears inside <main>, indicating that
 * children has rendered.
 *
 * ADR 0038 documents this decision.
 *
 * @example
 * await gotoAndWait(page, "/customers/new");
 * await fillField(page, "name", "João");
 */
export async function gotoAndWait(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector(
    "main h1, main form, main table, main [role='table'], main [role='region'], main [data-slot='card']",
    { timeout: 30_000 }
  );
}

/**
 * Navigate and wait for a specific selector (for atypical layouts).
 */
export async function gotoAndWaitFor(page: Page, url: string, selector: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector(selector, { timeout: 30_000 });
}
