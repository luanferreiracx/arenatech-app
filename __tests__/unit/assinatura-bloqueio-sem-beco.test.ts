/**
 * ASN-1 (Etapa 9, Módulo 17 — Assinatura): a tela de bloqueio virava um beco sem
 * saída quando a mensalidade não tinha valor.
 *
 * ## O contexto que torna isso grave
 *
 * Esta tela **existe justamente para evitar um beco**. O comentário da
 * `page.tsx` conta a história: antes, o tenant com assinatura vencida sumia de
 * `availableTenants`, o proxy o mandava para `/no-access` — que dizia *"sua conta
 * ainda não está vinculada a nenhuma loja"* e só oferecia Sair — e a tela de
 * pagar era inalcançável por ser rota de tenant. O lojista ficava trancado do
 * lado de fora lendo mensagem sobre outro problema.
 *
 * ## O defeito
 *
 * Com `amountCents = 0` (assinatura sem plano, valor não definido, cadastro
 * incompleto), a tela:
 *
 * - **escondia** a linha "Valor da mensalidade" (`amountCents > 0 &&`);
 * - **desabilitava** o botão (`disabled={amountCents <= 0}`);
 * - **não dizia nada** sobre o porquê.
 *
 * Sobrava "Pagar e reativar agora" inerte. Medido no navegador, com a
 * `loja-bloqueada` e `amount_cents = 0`:
 *
 * ```
 * valor visível?      false
 * botão habilitado?   false
 * explica o motivo?   false
 * ```
 *
 * Um controle que não responde e não explica recria o beco **dentro da própria
 * tela de saída**.
 *
 * ## A correção
 *
 * O caso sem valor deixou de ser "botão desabilitado" e passou a ser uma
 * mensagem: diz que a mensalidade não tem valor definido, aponta o suporte, e
 * reafirma que dados e carteira continuam intactos.
 *
 * Verificado depois:
 *
 * ```
 * botão morto?              0 ocorrências
 * explica o motivo?         sim
 * carteira ainda acessível? sim
 * reflow 320px:             rolagem 0, 0 elementos cortados
 * ```
 *
 * O caminho normal (valor > 0) segue intacto: botão habilitado, diálogo abrindo
 * com o valor e a exigência de CPF/CNPJ da Eulen.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TELA = readFileSync(
  join(
    process.cwd(),
    "src/app/(app)/assinatura-bloqueada/_components/blocked-subscription.tsx",
  ),
  "utf8",
);

/**
 * JSX quebra frases em várias linhas com indentação. Buscar `"suporte da Arena
 * Tech"` no fonte cru falha porque no arquivo está `"suporte da Arena\n   Tech"`
 * — foi o que reprovou a primeira versão destas asserções **contra o código já
 * corrigido**. Normaliza o espaço em branco para comparar o texto como o usuário
 * o lê.
 */
const TEXTO = TELA.replace(/\s+/g, " ");

describe("ASN-1 — a tela de bloqueio nunca vira beco sem saída", () => {
  it("não desabilita o botão de pagar por valor zero", () => {
    expect(
      TELA,
      "botão inerte sem explicação recria o beco que esta tela existe para " +
        "evitar — o lojista fica trancado olhando um controle que não responde.",
    ).not.toMatch(/disabled=\{amountCents <= 0\}/);
  });

  it("o caso sem valor mostra explicação, não um botão morto", () => {
    expect(TEXTO).toMatch(/amountCents > 0 \? \(/);
    expect(TEXTO).toMatch(/ainda não tem valor definido/);
    expect(TEXTO).toMatch(/suporte da Arena Tech/);
  });

  it("a explicação reafirma que dados e carteira ficam intactos", () => {
    // O medo de quem vê "assinatura suspensa" é perder o que construiu. A tela
    // toda gira em torno disso — o ramo sem valor não pode ser a exceção.
    const i = TEXTO.indexOf("ainda não tem valor definido");
    expect(TEXTO.slice(i, i + 300)).toMatch(/carteira DePix continuam intactos/);
  });

  it("o botão de pagar só existe quando há valor para cobrar", () => {
    // Gerar PIX de R$ 0,00 não faria sentido para a Eulen — o problema era
    // mostrar o botão assim mesmo, sem dizer por que não funciona.
    //
    // Ancora na ORDEM (`? (` antes do botão, botão antes do `: (`) em vez de
    // numa janela de N caracteres: a primeira versão usava 700 e não alcançava
    // o ternário, porque o comentário que explica a correção fica no meio.
    // O rótulo do botão aparece ANTES no arquivo — dentro do comentário que
    // explica esta correção. Ancorar no texto solto mediria a prosa, não o JSX
    // (terceira vez que esta armadilha aparece na Etapa 9: M7, M13, M17).
    const posTernario = TEXTO.indexOf("amountCents > 0 ? (");
    const posBotao = TEXTO.indexOf("Pagar e reativar agora", posTernario);
    const posSemValor = TEXTO.indexOf("ainda não tem valor definido");
    expect(posTernario).toBeGreaterThan(0);
    expect(posBotao).toBeGreaterThan(posTernario);
    expect(posBotao).toBeLessThan(posSemValor);
  });
});

describe("o que a tela já fazia certo (não regredir)", () => {
  it("a carteira DePix continua acessível durante o bloqueio", () => {
    // "Suspender a assinatura nunca bloqueia o seu dinheiro" — o saldo é do
    // lojista, não garantia de pagamento.
    expect(TELA).toMatch(/Abrir carteira DePix/);
    expect(TELA).toMatch(/href="\/depix-wallet"/);
  });

  it("quem não é admin recebe instrução, não um botão que falharia", () => {
    expect(TELA).toMatch(/Só o administrador da loja pode pagar a assinatura/);
  });

  it("os textos longos podem quebrar", () => {
    // Tela de 320px com parágrafos explicativos: sem `break-words` o texto
    // estouraria o cartão.
    const quebras = TELA.match(/break-words/g) ?? [];
    expect(quebras.length).toBeGreaterThanOrEqual(4);
  });
});
