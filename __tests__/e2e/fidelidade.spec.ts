/**
 * Fidelidade — o que o operador vê.
 *
 * O módulo tem ZERO campanhas em produção, e é justamente nesse estado que a tela
 * enganava: o CTA "Criar campanha" do estado vazio era gêmeo do botão do
 * cabeçalho — que já é `{isAdmin && …}` — mas nascia sem gate. Com zero campanhas
 * ele era a ÚNICA ação visível para o operador, e `createCampaign` recusa quem não
 * é admin.
 *
 * **Limite honesto deste teste:** o banco de seed tem uma campanha, então o
 * ESTADO VAZIO não renderiza aqui — e eu verifiquei que o teste passa mesmo com o
 * gate removido. Ou seja, ele guarda o botão do CABEÇALHO (que já era gateado
 * antes desta passada) e não o CTA do estado vazio, que foi o defeito corrigido.
 * Cobrir o vazio exigiria apagar as campanhas do seed, que outras suítes usam.
 *
 * O caminho do vazio foi verificado à mão, no navegador, contra a cópia de
 * produção — que tem zero campanhas: o operador passa a ver nenhum botão de criar
 * e a frase "A loja ainda não tem campanha de fidelidade. Quem cria é o
 * administrador."
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoAndWait } from "./helpers/navigation.helper";

async function login(page: Page, cpf: string, senha: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  const input = page.getByLabel("CPF");
  await input.waitFor({ state: "visible", timeout: 15000 });
  await input.click();
  await input.fill(cpf);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForLoadState("networkidle", { timeout: 15000 });
}

test.describe("Fidelidade — criar campanha é da administração", () => {
  test("@business FD-1 operador não vê nenhum botão de criar campanha", async ({ page }) => {
    await login(page, "52998224725", "Arena@2026");
    await gotoAndWait(page, "/fidelidade");

    await expect(page.getByRole("tab", { name: /Campanhas/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole("tab", { name: /Campanhas/i }).click();
    await page.waitForTimeout(1500);

    await expect(page.getByRole("button", { name: /Nova campanha/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Criar campanha/i })).toHaveCount(0);
  });

  test("@business FD-2 admin vê o caminho para criar", async ({ page }) => {
    await login(page, "86288366757", "Admin@2026");
    await gotoAndWait(page, "/fidelidade");

    await page.getByRole("tab", { name: /Campanhas/i }).click();
    await page.waitForTimeout(1500);

    // Pelo menos um dos dois caminhos (cabeçalho ou estado vazio) tem que existir.
    const cabecalho = await page.getByRole("button", { name: /Nova campanha/i }).count();
    const vazio = await page.getByRole("button", { name: /Criar campanha/i }).count();
    expect(cabecalho + vazio).toBeGreaterThan(0);
  });
});
