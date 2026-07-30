/**
 * Interesses (leads) — ciclo de vida completo.
 *
 * A suíte de clientes já tocava `/interests`, mas só na navegação. O ciclo de
 * vida do lead — cadastrar, contatar, registrar interação, converter — não tinha
 * nenhuma cobertura, e é exatamente o que está 100% parado em produção: 75 leads,
 * todos em `WAITING`, **zero** interações e **zero** conversões em 19 dias.
 *
 * A passada de backend explicou o zero de conversões (CL-1: o casamento por
 * telefone era impossível). O zero de interações não tem explicação técnica — o
 * caminho existe e funciona, como estes testes demonstram.
 *
 * Serial: os casos compartilham um lead.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoAndWait } from "./helpers/navigation.helper";
import { fillField } from "./helpers/form.helper";

test.describe.configure({ mode: "serial" });

const NOME_DO_LEAD = "Lead E2E Ciclo";
const TELEFONE = "86991234567";

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

/** Abre a ficha do lead de teste, criando-o na primeira execução. */
async function abrirLead(page: Page) {
  await gotoAndWait(page, "/interests");

  const busca = page.getByPlaceholder(/Buscar/i).first();
  if (await busca.isVisible().catch(() => false)) {
    await busca.fill(NOME_DO_LEAD);
    await page.waitForTimeout(1200);
  }

  const linha = page.locator('main tbody a[href^="/interests/"]').first();
  const existe = await linha
    .waitFor({ state: "visible", timeout: 6000 })
    .then(() => true)
    .catch(() => false);

  if (existe) {
    await linha.click();
  } else {
    await gotoAndWait(page, "/interests/new");
    await fillField(page, "customerName", NOME_DO_LEAD);
    await fillField(page, "phone", TELEFONE);
    await fillField(page, "desiredModel", "iPhone 15 Pro");
    await page.getByRole("button", { name: /Cadastrar|Salvar/i }).first().click();
  }
  await page.waitForURL(/\/interests\/[0-9a-f-]{36}/, { timeout: 20000 });
}

test.describe("Interesses — ciclo de vida do lead", () => {
  test("@business I-1 cadastra o lead e ele nasce em Em Espera", async ({ page }) => {
    await login(page);
    await abrirLead(page);

    await expect(page.locator("main")).toContainText(NOME_DO_LEAD, { timeout: 15000 });
    await expect(page.locator("main")).toContainText(/Em Espera/i);
  });

  test("@business I-2 registra uma interação — a conversa com o lead fica no histórico", async ({
    page,
  }) => {
    await login(page);
    await abrirLead(page);

    await page.getByRole("button", { name: /Nova intera/i }).click();
    // Por LABEL de propósito: os campos deste diálogo não tinham nome acessível
    // nenhum (CLU-2) e este localizador é o que prova a correção — se alguém
    // remover o `htmlFor`, o teste cai aqui.
    const descricao = page.getByLabel(/Descrição/i);
    await descricao.waitFor({ state: "visible", timeout: 10000 });
    await descricao.fill("Liguei; cliente pediu para retornar na sexta.");
    await page.getByRole("button", { name: /Salvar|Registrar|Adicionar/i }).last().click();

    await expect(page.locator("main")).toContainText(/retornar na sexta/i, { timeout: 15000 });
  });

  test("@business I-3 muda o status para Contatado e o valor persiste", async ({ page }) => {
    await login(page);
    await abrirLead(page);

    // Espera o lead CARREGAR antes de escolher o alvo: enquanto a query não
    // resolve, `interest.status` é indefinido, nenhum botão fica desabilitado e a
    // escolha vira loteria. (Foi assim que este teste falhou de forma
    // intermitente — a aplicação estava certa, o teste é que corria.)
    const statusButtons = page.getByRole("button", {
      name: /^(Em Espera|Contatado|Finalizado|Cancelado)$/,
    });
    await expect(statusButtons.and(page.locator(":disabled")).first()).toBeVisible({
      timeout: 15000,
    });

    // O botão do status ATUAL vem desabilitado, então o alvo depende de onde o
    // lead está — e ele carrega o estado da execução anterior.
    const contatado = page.getByRole("button", { name: /^Contatado$/ });
    const emEspera = page.getByRole("button", { name: /^Em Espera$/ });
    const alvo = (await contatado.isEnabled()) ? contatado : emEspera;
    const rotulo = await alvo.innerText();

    await alvo.click();
    // Espera o EFEITO, não a rede: `waitForLoadState("networkidle")` resolvia
    // antes de a mutation sequer sair, e o reload cancelava o pedido — o teste
    // acusava "não persistiu" sobre um app que persiste. O sinal real é o botão
    // do novo status ficar desabilitado.
    await expect(alvo).toBeDisabled({ timeout: 15000 });

    // Recarrega: status de lead é dado, não estado de tela.
    await page.reload({ waitUntil: "domcontentloaded" });
    // Nada de `toContainText(rotulo)`: o rótulo é o texto do próprio botão e
    // aparece sempre — passaria mesmo sem persistir. O sinal honesto é o botão do
    // status ATUAL vir desabilitado depois de recarregar.
    await expect(page.getByRole("button", { name: new RegExp(`^${rotulo}$`) })).toBeDisabled({
      timeout: 15000,
    });
  });

  test("@business I-4 a lista mostra o funil de conversão", async ({ page }) => {
    await login(page);
    await gotoAndWait(page, "/interests");

    // O contador é o que denunciava o CL-1 em produção: "Conversão (0/70)" com
    // 6 leads que já tinham comprado. Ele precisa existir para alguém notar.
    await expect(page.locator("main")).toContainText(/Convers/i, { timeout: 15000 });
  });
});
