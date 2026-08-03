/**
 * Comissões — primeiro E2E do módulo.
 *
 * O módulo movimenta dinheiro real em produção (R$ 2.661,94 numa única apuração)
 * e não tinha um único teste de fluxo. Esta suíte cobre o caminho principal do
 * admin e os dois estados que a passada de frontend corrigiu:
 *
 * CMU-2 — a lista de prestadores fazia `data ?? []`, então o 403 do operador
 *   virava "Nenhum prestador cadastrado" **com botão de cadastrar**. A tela
 *   afirmava que não existiam prestadores quando existiam 7.
 * CMU-3 — o formulário de novo prestador renderizava inteiro para o operador,
 *   com o seletor listando nome e CPF de todos os usuários do tenant, e um
 *   "Cadastrar prestador" que só podia terminar em 403.
 *
 * Idempotente: reaproveita o prestador se ele já existir (o seed não tem nenhum,
 * mas a suíte roda repetidas vezes contra o mesmo banco).
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoAndWait } from "./helpers/navigation.helper";

// Serial: os cinco casos compartilham UM prestador (o seed não traz nenhum). Em
// paralelo, dois workers tentavam cadastrar o mesmo usuário e o segundo levava
// CONFLICT — verde sozinho, vermelho na suíte. O fixture é compartilhado; a
// execução também tem que ser.
test.describe.configure({ mode: "serial" });

const PRESTADOR = "Tecnico Arena";

async function login(page: Page, cpf: string, senha: string) {
  // Sair DE VERDADE antes de entrar como outro usuário.
  //
  // `clearCookies()` limpa o jar do contexto, mas quem estava logado continua
  // logado até a próxima navegação — e o proxy, vendo sessão válida, manda
  // `/login` direto para `/painel`. O helper então esperava 15s por um campo
  // "CPF" que nunca ia aparecer, e o teste morria com um timeout que não diz
  // nada sobre a causa (foi assim que o CO-5 ficou vermelho na main, parecendo
  // um bug de comissão quando era troca de sessão).
  //
  // `/logout` encerra a sessão no servidor; o `clearCookies` depois garante que
  // nada sobreviva no cliente. Só então `/login` renderiza o formulário.
  await page.goto("/logout");
  await page.waitForLoadState("domcontentloaded");
  await page.context().clearCookies();

  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  const cpfInput = page.getByLabel("CPF");
  await cpfInput.waitFor({ state: "visible", timeout: 15000 });
  await cpfInput.click();
  await cpfInput.fill(cpf);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForLoadState("networkidle", { timeout: 15000 });
}

const comoAdmin = (page: Page) => login(page, "86288366757", "Admin@2026");
const comoOperador = (page: Page) => login(page, "52998224725", "Arena@2026");
const comoPrestador = (page: Page) => login(page, "39053344705", "Tecnico@2026");

/** Abre a ficha do prestador de teste, criando-o se ainda não existir. */
async function abrirFichaDoPrestador(page: Page) {
  await gotoAndWait(page, "/commissions/providers");

  // Reuso pelo link da linha, não pelo texto da célula: o `href` é inequívoco e
  // não depende de como a DataTable resolve papéis ARIA.
  //
  // `waitFor`, não `count()`/`isVisible()`: os dois respondem na hora, e a tabela
  // só aparece quando a query do cliente resolve — o teste ia direto para o
  // cadastro e falhava na segunda execução, quando o prestador já existia (e por
  // isso mesmo tinha sumido da lista de usuários disponíveis).
  const abrir = page.locator('main tbody a[href^="/commissions/providers/"]').first();
  const jaExiste = await abrir
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (jaExiste) {
    await abrir.click();
    await page.waitForURL(/\/commissions\/providers\/[0-9a-f-]{36}/, { timeout: 15000 });
    return;
  }

  await gotoAndWait(page, "/commissions/providers/new");
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: new RegExp(PRESTADOR) }).click();
  await page.getByRole("button", { name: /Cadastrar prestador/i }).click();
  await page.waitForURL(/\/commissions\/providers\/[0-9a-f-]{36}/, { timeout: 20000 });
}

test.describe("Comissões — administração", () => {
  test("@business CO-1 admin cadastra prestador e cai na ficha avisando que falta contrato", async ({
    page,
  }) => {
    await comoAdmin(page);
    await abrirFichaDoPrestador(page);

    await expect(page.locator("main")).toContainText(PRESTADOR, { timeout: 15000 });
    // CMU-7: `createProvider` já cria um contrato VAZIO, e o motor trata contrato
    // sem regra como "sem contrato vigente". A ficha tem que avisar nos dois casos
    // — antes ela só avisava quando não havia contrato nenhum, e o prestador
    // recém-cadastrado ficava no vão: nada comissionado, nada avisado.
    await expect(page.locator("main")).toContainText(
      /sem contrato vigente|sem nenhuma aliquota cadastrada/i,
      { timeout: 15000 },
    );
  });

  test("@business CO-2 admin calcula o mês e vê os quatro totais da apuração", async ({ page }) => {
    await comoAdmin(page);
    await abrirFichaDoPrestador(page);

    await page.getByRole("button", { name: /^Calcular$/ }).click();
    await page.waitForLoadState("networkidle", { timeout: 20000 });

    for (const rotulo of [/Comissao bruta/i, /Estornos/i, /Ajuda de custo/i, /Liquido a pagar/i]) {
      await expect(page.locator("main")).toContainText(rotulo, { timeout: 20000 });
    }
  });
});

test.describe("Comissões — o que o operador NÃO pode ver", () => {
  test("@business CO-3 lista bloqueada não se disfarça de lista vazia", async ({ page }) => {
    await comoOperador(page);
    await gotoAndWait(page, "/commissions/providers");

    await expect(page.locator("main")).toContainText(/é da administração/i, { timeout: 15000 });
    // A regressão que importa: "vazio" e "bloqueado" voltarem a ser a mesma tela.
    await expect(page.locator("main")).not.toContainText(/Nenhum prestador cadastrado/i);
    await expect(page.getByRole("button", { name: /Novo prestador/i })).toHaveCount(0);
  });

  test("@business CO-4 cadastro bloqueado não expõe a lista de usuários", async ({ page }) => {
    await comoOperador(page);
    await gotoAndWait(page, "/commissions/providers/new");

    await expect(page.locator("main")).toContainText(/é da administração/i, { timeout: 15000 });
    // `listAvailableUsers` devolve nome + CPF de todo o tenant e era `tenantProcedure`.
    await expect(page.getByRole("button", { name: /Cadastrar prestador/i })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(PRESTADOR);
  });
});

test.describe("Comissões — self-service do prestador", () => {
  test("@business CO-5 prestador vê a própria apuração e o motivo de estar zerada", async ({
    page,
  }) => {
    // Garante que o prestador existe antes de entrar como ele.
    await comoAdmin(page);
    await abrirFichaDoPrestador(page);

    await comoPrestador(page);
    await gotoAndWait(page, "/my-commission");

    await expect(page.locator("main")).toContainText(/Memoria de calculo/i, { timeout: 15000 });
    await expect(page.locator("main")).not.toContainText(/Voce nao e um prestador/i);
  });
});
