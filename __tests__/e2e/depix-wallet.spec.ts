import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./helpers/cashier.helper";

/**
 * Finalização — Módulo 6 (DePix Wallet), passada de frontend.
 *
 * Primeiro E2E do módulo: até aqui a carteira DePix — o dinheiro irreversível do
 * sistema — não tinha **nenhum** teste de fluxo real. Estes casos são
 * independentes de dado (não exigem carteira provisionada nem cobrança viva),
 * para valerem tanto no seed quanto em produção.
 */

/** Piso da WCAG 1.4.10. */
const NARROW = { width: 320, height: 800 };

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("DePix Wallet — telas de dinheiro", () => {
  test("@smoke a carteira abre e cabe em 320px", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await loginAs(page, "operator");
    await page.goto("/depix-wallet");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("@business as rotas legadas de saque levam para a carteira", async ({ page }) => {
    // `/depix/*` são stubs de redirect desde a migração para `/depix-wallet`.
    // Se um deles voltar a renderizar tela própria, é sinal de que o fluxo de
    // saque ganhou uma segunda porta — exatamente o padrão que este programa
    // encontrou em três módulos.
    await loginAs(page, "operator");

    await page.goto("/depix/withdrawals");
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/depix-wallet");

    await page.goto("/depix/withdrawals/new");
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/depix-wallet/withdraw");
  });
});

test.describe("Pagamento público — o que o cliente vê", () => {
  test("@business link inexistente não expõe nada e responde 404", async ({ page }) => {
    // A página é pública e o token é o único controle de acesso: token inválido
    // não pode virar tela de cobrança nem vazar nome de comerciante.
    const res = await page.goto("/pay/token-que-nao-existe-mesmo");
    expect(res?.status()).toBe(404);
    await expect(page.locator("body")).not.toContainText(/Arena Tech|Pagar com PIX/i);
  });

  test("@business a página de pagamento cabe em 320px", async ({ page }) => {
    // É a tela que o cliente final abre no celular, quase sempre num aparelho
    // pequeno, e fora de qualquer sessão nossa.
    await page.setViewportSize(NARROW);
    const res = await page.goto("/pay/token-que-nao-existe-mesmo");
    expect(res?.status()).toBe(404);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
});

/**
 * Histórico completo da carteira.
 *
 * Reportado pelo dono depois do fechamento do Módulo 6, e ele estava certo: o
 * "Ver tudo" do cartão de atividade recente apontava para
 * `/depix-wallet?view=all` — um parâmetro que **nenhuma página lia**. O clique
 * navegava para a mesma tela e nada mudava. Dava para ver as 8 últimas
 * transações e mais nada, sem paginação e sem filtro.
 *
 * Medido em produção na hora do conserto: **474 transações** (413 depósitos, 61
 * saques) em dois meses. A loja enxergava 1,7% do próprio histórico.
 *
 * A `depixTransaction.list` já aceitava `page`, `pageSize`, `kind` e `status`, e
 * já devolvia `total` — a paginação existia no backend desde sempre. Faltava a
 * tela.
 *
 * Estes casos são independentes de dado: valem no seed (zero transações) e em
 * produção. O que eles garantem é que **o caminho existe** — que era exatamente
 * o que faltava.
 */
test.describe("DePix Wallet — histórico completo", () => {
  test("@business a lista existe, com filtro de tipo e de situação", async ({ page }) => {
    await loginAs(page, "operator");
    await page.goto("/depix-wallet/transactions");
    await page.waitForLoadState("networkidle", { timeout: 20000 });

    // Filtros que a procedure já aceitava e a tela nunca ofereceu.
    await expect(page.getByLabel("Tipo")).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel("Situação")).toBeVisible();
  });

  test("@business com transações, o histórico pagina", async ({ page }) => {
    await loginAs(page, "operator");
    await page.goto("/depix-wallet/transactions");
    await page.waitForLoadState("networkidle", { timeout: 20000 });

    const temTransacao = (await page.locator("main ul li").count()) > 0;
    // O seed não provisiona carteira nem transação. Skip EXPLÍCITO em vez de
    // asserção vazia: um teste que passa por não ter dado não guarda nada, e
    // esconder isso foi um erro que este programa já cometeu.
    test.skip(!temTransacao, "seed sem transações na carteira — paginação verificada à mão na cópia de produção");

    await expect(page.getByRole("button", { name: /Anterior/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Próxima/i })).toBeVisible();
    await expect(page.locator("main")).toContainText(/Página \d+ de \d+/);
  });

  test("@business o 'Ver tudo' leva à lista, não à própria tela", async ({ page }) => {
    await loginAs(page, "operator");
    await page.goto("/depix-wallet");
    await page.waitForLoadState("networkidle", { timeout: 20000 });

    const verTudo = page.getByRole("link", { name: /Ver tudo/i });
    const temCartao = await verTudo
      .waitFor({ state: "visible", timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!temCartao, "carteira não provisionada no seed — o cartão de atividade não renderiza");

    // A regressão que importa: o link voltar a apontar para a própria página
    // (`?view=all`, parâmetro que ninguém lia).
    await expect(verTudo).toHaveAttribute("href", "/depix-wallet/transactions");
    await verTudo.click();
    await page.waitForURL(/\/depix-wallet\/transactions$/, { timeout: 20000 });
  });

  test("@business a lista cabe em 320px", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await loginAs(page, "operator");
    await page.goto("/depix-wallet/transactions");
    await page.waitForLoadState("networkidle", { timeout: 20000 });

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});
