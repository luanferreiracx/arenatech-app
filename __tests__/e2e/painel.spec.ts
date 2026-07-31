/**
 * Painel — a tela mais aberta do sistema, e a que mente melhor quando falha.
 *
 * PN-1: o bloco de indicadores era `stats ? <KPIs> : null`. Com a query falhando,
 * a linha INTEIRA de números sumia e o painel seguia renderizando saudação,
 * atalhos, gráficos e tabelas — parecendo completo. Quem olhasse leria a ausência
 * como "não há nada hoje".
 *
 * PN-2: o bloco "Requer atenção" fazia o mesmo. Ausência de alerta é uma
 * AFIRMAÇÃO ("nada precisa de você"); sumir em silêncio a fazia sem ter checado.
 *
 * Este teste cobre o caminho feliz — que os números aparecem e batem em forma.
 * O caminho de erro foi verificado à mão: sem stats, a tela agora mostra o estado
 * de erro em vez de nada.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoAndWait } from "./helpers/navigation.helper";

async function login(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  const cpf = page.getByLabel("CPF");
  await cpf.waitFor({ state: "visible", timeout: 15000 });
  await cpf.click();
  await cpf.fill("52998224725");
  await page.getByLabel("Senha").fill("Arena@2026");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForLoadState("networkidle", { timeout: 15000 });
}

test.describe("Painel", () => {
  test("@business PN-1 os indicadores aparecem, não somem em silêncio", async ({ page }) => {
    await login(page);
    await gotoAndWait(page, "/painel");

    // Os quatro rótulos que resumem a operação. Se a query falhar e o bloco
    // voltar a ser `null`, este teste cai — que é o ponto.
    for (const rotulo of [/Faturamento hoje/i, /Vendas hoje/i, /OS abertas/i, /Clientes/i]) {
      await expect(page.locator("main")).toContainText(rotulo, { timeout: 20000 });
    }
  });

  test("@business PN-2 o painel não rola na horizontal no celular", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await gotoAndWait(page, "/painel");
    await page.waitForTimeout(2000);

    // CMN-1 (corrigido no Módulo 11): os cartões de alerta eram itens de grid sem
    // `min-w-0`, e a página chegava a 932px numa tela de 390.
    const transborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(transborda, "painel transbordando na horizontal").toBe(false);
  });
});
