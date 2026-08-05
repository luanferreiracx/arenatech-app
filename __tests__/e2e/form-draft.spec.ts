import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/cashier.helper";

/**
 * Rascunho de formulário longo (auditoria de frontend 2026-08-04).
 *
 * A compra de aparelho tem ~20 campos. Antes, um F5, um clique errado em
 * Cancelar ou a aba fechando perdia tudo — com o cliente na frente do balcão.
 * O `useRhfDraft` grava em `sessionStorage` e devolve ao voltar.
 *
 * O teste tem de rodar no browser: o modo de falha que importa aqui é
 * hidratação. Ler `sessionStorage` no `useState` inicial faz o servidor
 * renderizar vazio e o cliente renderizar restaurado, e o React descarta a
 * árvore com "Hydration failed" — que não aparece em typecheck nem em lint.
 */
test.describe("rascunho de formulário", () => {
  test("@business a compra de aparelho retoma o que foi digitado", async ({ page }) => {
    const hidratacao: string[] = [];
    page.on("console", (m) => {
      if (/Hydration failed|did not match/i.test(m.text())) hidratacao.push(m.text());
    });

    await loginAs(page, "operator");
    await page.goto("/stock/purchases/new");
    await page.waitForLoadState("networkidle");

    const campo = page.locator("input[type='text']").first();
    await campo.fill("356938035643809");
    // O rascunho é gravado no `watch` do RHF; dá um respiro antes de sair.
    await page.waitForTimeout(600);

    await page.goto("/stock");
    await page.waitForLoadState("networkidle");
    await page.goto("/stock/purchases/new");
    await page.waitForLoadState("networkidle");

    const aviso = page.getByText(/Retomamos o preenchimento/i);
    await expect(aviso).toBeVisible({ timeout: 10000 });
    await expect(campo).toHaveValue("356938035643809");

    // "Começar do zero" descarta o rascunho e o aviso some.
    await page.getByRole("button", { name: /Começar do zero/i }).click();
    await expect(aviso).toBeHidden({ timeout: 10000 });

    expect(hidratacao, hidratacao.join("\n")).toEqual([]);
  });
});
