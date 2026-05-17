import type { Page } from "@playwright/test";

/**
 * Fill a react-hook-form input via native setter + dispatchEvent.
 *
 * page.fill() does NOT trigger onChange from react-hook-form's register().
 * This helper uses the native HTMLInputElement value setter which React
 * intercepts, then dispatches an "input" event to trigger form state update.
 *
 * ADR 0037 documents this decision.
 *
 * @param page - Playwright Page
 * @param name - input name attribute (from react-hook-form register)
 * @param value - value to set
 */
export async function fillField(page: Page, name: string, value: string): Promise<void> {
  const locator = page.locator(`[name="${name}"]`);
  await locator.waitFor({ state: "visible", timeout: 30000 });

  await locator.evaluate((el: HTMLInputElement, val: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

/**
 * Fill a react-hook-form textarea via native setter.
 */
export async function fillTextarea(page: Page, name: string, value: string): Promise<void> {
  const locator = page.locator(`textarea[name="${name}"]`);
  await locator.waitFor({ state: "visible", timeout: 10000 });

  await locator.evaluate((el: HTMLTextAreaElement, val: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

/**
 * Fill any input by placeholder text (for non-register inputs like search).
 */
export async function fillByPlaceholder(page: Page, placeholder: string | RegExp, value: string): Promise<void> {
  const locator = page.getByPlaceholder(placeholder);
  await locator.waitFor({ state: "visible", timeout: 30000 });

  await locator.evaluate((el: HTMLInputElement, val: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
