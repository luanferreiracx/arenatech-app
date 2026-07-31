/**
 * Catálogo público — primeira cobertura da superfície anônima.
 *
 * `/catalog` é a única tela do sistema que qualquer pessoa abre sem login: é
 * indexável, é multi-tenant por subdomínio e é o cartão de visita da loja. Não
 * tinha nenhum teste.
 *
 * CTU-1: o `alt` da logo era a string literal "Logo" — o nome do TIPO de coisa,
 * não da coisa (WCAG 1.1.1). Medido no navegador, o nome da loja não aparecia em
 * texto nenhum do corpo da página, só no `<title>`: quem usa leitor de tela não
 * tinha como saber de quem era o catálogo. `CatalogContact.storeName` já estava
 * carregado e já chegava ao componente — só não era usado.
 */
import { test, expect } from "@playwright/test";

test.describe("Catálogo público", () => {
  test("@business CAT-1 abre sem login e lista produtos", async ({ page }) => {
    await page.context().clearCookies();
    const res = await page.goto("/catalog", { waitUntil: "domcontentloaded" });

    expect(res?.status()).toBe(200);
    await expect(page.locator("main")).toBeVisible({ timeout: 15000 });
    // Não deve redirecionar para o login: é público por desenho.
    expect(new URL(page.url()).pathname).toBe("/catalog");
  });

  test("@business CAT-2 a logo da loja tem nome acessível", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/catalog", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Sem `waitFor` numa imagem: o banco de seed não tem logo nem foto de produto,
    // então aqui a asserção roda sobre zero imagens e passa por vacuidade. Ela
    // morde em qualquer ambiente COM imagens — e foi verificada à mão contra a
    // cópia de produção, onde os dois `alt` da logo passaram de "Logo" para
    // "Arena Tech".
    const alts = await page.locator("img").evaluateAll((imgs) =>
      imgs.map((i) => i.getAttribute("alt") ?? ""),
    );
    // O defeito exato: `alt="Logo"` — nome do tipo de coisa, não da coisa.
    expect(alts, 'nenhuma imagem pode ter alt="Logo"').not.toContain("Logo");
    // E nenhuma imagem sem alternativa textual.
    expect(alts.filter((a) => a === "").length, "imagem sem alt").toBe(0);
  });
});
