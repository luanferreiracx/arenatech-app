/**
 * Funil self-service (ADR 0061) — a porta de entrada da venda, vista por quem
 * NÃO tem sessão.
 *
 * @smoke porque é a única superfície do sistema em que uma falha custa receita
 * direta e ninguém reclama: um visitante que leva 307 pro /login some sem abrir
 * chamado. As rotas públicas deste projeto já quebraram assim duas vezes (a API
 * de parceiros ficou um mês inalcançável, #732; o tRPC do NO-KYC antes dela).
 *
 * Testa o que o E2E vê melhor que qualquer teste de unidade: que a página
 * RESPONDE sem cookie e que o plano escolhido atravessa a navegação até o
 * cadastro.
 */
import { test, expect } from "@playwright/test";

test.describe("vitrine de planos", () => {
  test("@smoke visitante sem sessão vê os planos e os preços", async ({ page }) => {
    // Contexto limpo do Playwright já vem sem cookie — é a vantagem do visitante.
    await page.goto("/planos");
    await page.waitForLoadState("domcontentloaded");

    // Não redirecionou pro login: é o defeito que este teste existe para pegar.
    await expect(page).toHaveURL(/\/planos$/);

    const main = page.locator("main");
    await expect(main).toContainText("Assistência");
    await expect(main).toContainText("Completo");
    // Preço de verdade, não placeholder.
    await expect(main).toContainText(/R\$\s?\d/);
    // A promessa do teste grátis vem do servidor (padrão da plataforma).
    await expect(main).toContainText(/dias? grátis/i);
  });

  test("@smoke a vitrine NÃO vaza o gating de módulos", async ({ page }) => {
    // P2 da auditoria 2026-07-14: `features.modules` é a intenção de gating e
    // não pode aparecer num endpoint sem auth. Aqui se confere no HTML servido,
    // que é o que o visitante realmente recebe.
    await page.goto("/planos");
    const html = await page.content();
    for (const chave of ["pdv-retail", "service-orders", "depix-ops", '"modules"']) {
      expect(html).not.toContain(chave);
    }
  });

  test("@smoke plano escolhido chega ao cadastro", async ({ page }) => {
    await page.goto("/planos");
    await page.getByRole("link", { name: /Começar .* no plano Completo/i }).click();

    await page.waitForURL(/\/register\?plano=completo/, { timeout: 15000 });
    await expect(page.locator("main")).toContainText("Plano escolhido");
    await expect(page.locator("main")).toContainText("Completo");
    // O formulário de cadastro está lá — o funil não termina numa tela morta.
    await expect(page.getByLabel("E-mail *")).toBeVisible();
  });

  test("@business plano inválido na URL não derruba o cadastro", async ({ page }) => {
    // A pessoa está no meio do funil; um parâmetro torto (link velho, plano
    // aposentado, URL editada) não pode custar a conta dela.
    await page.goto("/register?plano=plano-que-nao-existe");
    await expect(page.locator("main")).toContainText(/escolher o plano depois/i);
    await expect(page.getByLabel("E-mail *")).toBeVisible();
  });

  test("@business plano LEGADO não é contratável por URL", async ({ page }) => {
    // `free` (R$ 0) segue ACTIVE no banco porque um tenant aponta pra ele.
    // Aceitá-lo aqui daria o sistema de graça a quem editasse a URL.
    await page.goto("/register?plano=free");
    await expect(page.locator("main")).not.toContainText("Plano escolhido");
    await expect(page.locator("main")).toContainText(/escolher o plano depois/i);
  });

  test("@business login oferece o caminho de quem ainda não tem conta", async ({ page }) => {
    await page.goto("/login");
    const entrada = page.getByRole("link", { name: /Ver planos e começar grátis/i });
    await expect(entrada).toBeVisible();
    await entrada.click();
    await page.waitForURL(/\/planos$/, { timeout: 15000 });
  });
});
