/**
 * E9-6 (Etapa 9, Módulo 7 — Clientes): a ficha do cliente oferecia
 * `wa.me/55<numero>` para falar com o cliente.
 *
 * ## O dono corrigiu meu diagnóstico
 *
 * Minha primeira leitura foi "o link fura o opt-out da LGPD", e o fix foi
 * esconder o link quando `unsubscribed`. **Estava tratando o sintoma.**
 *
 * O dono apontou o problema real: *"usamos Chatwoot, isso é totalmente sem
 * sentido"*. E está certo — `wa.me` abre a conversa no **WhatsApp pessoal do
 * operador**:
 *
 * - fora do Chatwoot, então **fora do inbox unificado**;
 * - fora do `sendToCustomer`, então **sem registro** de que a loja contatou;
 * - fora do gate de opt-out **e** do aviso de janela de 24h da Meta;
 * - no número **pessoal** de quem clicou, não no da loja.
 *
 * Esconder por opt-out consertava 1 caso de N. O link não deveria existir para
 * caso nenhum.
 *
 * ## Nem todo `wa.me` é errado — a direção é o que decide
 *
 * | onde | direção | veredito |
 * |---|---|---|
 * | catálogo público, marketing, `/register/rejected` | **cliente → loja** | legítimo: o cliente não tem Chatwoot |
 * | `generate-link-dialog` (`wa.me/?text=`, **sem número**) | operador → **qualquer um** | legítimo: abre o seletor para compartilhar um link |
 * | **`customer-detail`** | **loja → cliente** | **era o único errado** |
 *
 * Por isso este teste mira `wa.me/55` seguido de número — a forma que **inicia
 * contato com um cliente específico** — e não `wa.me` em geral.
 *
 * ## Verificado no navegador
 *
 * ```
 * ficha:    {"linksWa":0, "temBotaoMensagem":true, "telefoneVisivel":true}
 * diálogo:  "Enviar WhatsApp · Para POLIANA... · Fora da janela de 24h — a Meta
 *            só entrega template aprovado."
 * ```
 *
 * O telefone continua **visível** (o operador precisa dele para atender quem
 * ligou); o que sai é o convite a iniciar contato por fora.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const DETALHE = readFileSync(
  join(
    process.cwd(),
    "src/app/(app)/customers/[id]/_components/customer-detail.tsx",
  ),
  "utf8",
);

/**
 * Telas do app autenticado que geram `wa.me` com número — ou seja, que
 * **iniciam** contato com alguém específico a partir do painel.
 *
 * O catálogo público e o marketing ficam de fora do escopo: lá o link é o
 * caminho do CLIENTE até a loja, e o cliente não tem Chatwoot.
 */
function linksQueIniciamContato(): string[] {
  try {
    // Mira o que o NAVEGADOR executa — uma URL `wa.me` com número atribuída a
    // `href`/`window.open`/`return` —, não a string solta.
    //
    // A primeira versão fazia grep de `wa.me/[0-9$]` no arquivo inteiro e
    // acusou o próprio comentário que explica esta remoção. Tentei então
    // descartar linhas que começam com `*` ou `//`, e também não bastou: dentro
    // de um bloco `{/* ... */}` do JSX as linhas de continuação não têm
    // prefixo nenhum. Filtrar prosa por sintaxe é frágil nos dois sentidos —
    // acusaria quem documenta e deixaria passar um link real comentado.
    const saida = execFileSync(
      "grep",
      [
        "-rnE",
        "--include=*.tsx",
        "--include=*.ts",
        "(href=|window\\.open\\(|return )[\"'`]?https://wa\\.me/[0-9$]",
        "src/app/(app)",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    return saida.split("\n").filter(Boolean);
  } catch {
    return []; // grep sai 1 quando não acha — o estado desejado
  }
}

describe("E9-6 — o painel não abre WhatsApp pessoal para o cliente", () => {
  it("nenhuma tela do app gera wa.me com número", () => {
    const achados = linksQueIniciamContato();
    expect(
      achados,
      "`wa.me/55<numero>` abre a conversa no WhatsApp PESSOAL do operador: fora " +
        "do Chatwoot, fora do inbox unificado, sem registro, sem gate de opt-out " +
        "e sem o aviso de janela de 24h da Meta. Use o `CustomerMessageDialog`.",
    ).toEqual([]);
  });

  it("a ficha do cliente tem o caminho CERTO de contato", () => {
    // Remover o link sem oferecer alternativa deixaria o operador sem saída —
    // e ele voltaria a copiar o número no WhatsApp pessoal, que é pior: some
    // até do código.
    expect(DETALHE).toMatch(/CustomerMessageDialog/);
    expect(DETALHE).toMatch(/Enviar mensagem/);
  });

  it("usa o MESMO diálogo da lista, não uma cópia", () => {
    // Duas implementações do mesmo envio divergiriam no gate de opt-out — é o
    // padrão "a regra existe e o irmão fica de fora", que este programa já
    // nomeou 15 vezes.
    expect(DETALHE).toMatch(/from "\.\.\/\.\.\/_components\/customer-message-dialog"/);
  });

  it("o telefone continua visível como texto", () => {
    // Nega a AÇÃO de contatar por fora, não a informação de trabalho: o
    // operador precisa do número para atender quem ligou para a loja.
    expect(DETALHE).toMatch(/<span>\{formatPhone\(customer\.phone\)\}<\/span>/);
  });
});
