/**
 * E9-6 (Etapa 9, Módulo 7 — Clientes): a ficha do cliente oferecia um link
 * `wa.me` direto **mesmo para quem pediu para não receber comunicações**.
 *
 * O `CustomerMessageDialog` já respeitava o opt-out — bloqueia o envio e cita a
 * LGPD. Mas a ficha tem **dois links de WhatsApp** (telefone principal e
 * alternativo) que abrem a conversa fora do sistema: contornam o gate e saem do
 * rastro.
 *
 * Provado no navegador, com o opt-out ativo num cliente real:
 *
 * ```
 * {"linksWhatsApp":["https://wa.me/5586995423021"], "avisaOptOut":false}
 * ```
 *
 * O operador via CPF, WhatsApp e telefone — e **nada** indicava que aquela
 * pessoa havia pedido para não ser contatada.
 *
 * ## A decisão: esconder o CONVITE, não o dado
 *
 * O telefone **continua visível**. O operador precisa dele para atender quem
 * ligou para a loja — esconder o número quebraria o atendimento legítimo.
 *
 * O que some é o `wa.me`: o atalho que **inicia** contato. É a mesma lógica do
 * M6 (custo no PDF): nega a ação, não a informação de trabalho.
 *
 * E o aviso é obrigatório junto: **link que some sem explicação é pior que link
 * que nega** — o operador acharia que a tela quebrou.
 *
 * Verificado depois do fix:
 *
 * | estado | aviso | links `wa.me` | telefone |
 * |---|---|---|---|
 * | sem opt-out | não | 1 | visível |
 * | **com opt-out** | **sim** | **0** | **visível** |
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DETALHE = readFileSync(
  join(
    process.cwd(),
    "src/app/(app)/customers/[id]/_components/customer-detail.tsx",
  ),
  "utf8",
);

describe("E9-6 — ficha do cliente respeita o opt-out", () => {
  it("o helper de WhatsApp recebe o flag de opt-out", () => {
    expect(
      DETALHE,
      "`whatsappHref` gerava o link só com o telefone. Quem optou por não " +
        "receber comunicações ganhava um atalho que contorna o gate do " +
        "`CustomerMessageDialog` e sai do rastro.",
    ).toMatch(/function whatsappHref\([^)]*unsubscribed[^)]*\)/);
  });

  it("devolve null quando há opt-out — antes de qualquer outra checagem", () => {
    const i = DETALHE.indexOf("function whatsappHref(");
    const corpo = DETALHE.slice(i, i + 260);
    expect(corpo).toMatch(/if \(unsubscribed\) return null;/);
  });

  it("TODAS as chamadas passam o flag (o telefone alternativo também)", () => {
    const chamadas = DETALHE.match(/whatsappHref\(customer\.\w+/g) ?? [];
    const comFlag = DETALHE.match(/whatsappHref\(customer\.\w+, customer\.unsubscribed\)/g) ?? [];
    expect(
      comFlag.length,
      "há chamada de `whatsappHref` sem o flag — provavelmente o telefone " +
        "alternativo, que é fácil de esquecer.",
    ).toBe(chamadas.length);
  });

  it("a ficha AVISA o opt-out, não só esconde o link", () => {
    // Link que some sem explicação é pior que link que nega: o operador
    // acharia que a tela quebrou.
    expect(DETALHE).toMatch(/customer\.unsubscribed && \(/);
    expect(DETALHE).toMatch(/optou por não receber comunicações/);
    expect(DETALHE).toMatch(/role="status"/);
  });

  it("o telefone continua visível (nega a AÇÃO, não a informação)", () => {
    // Esconder o número quebraria o atendimento de quem LIGOU para a loja.
    // Mesma lógica do M6: o custo sai do PDF, o relatório continua.
    expect(DETALHE).toMatch(/<span>\{formatPhone\(customer\.phone\)\}<\/span>/);
  });
});
