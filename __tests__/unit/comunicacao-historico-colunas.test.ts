/**
 * CMN-1 (Etapa 9, Módulo 10 — Comunicação): no histórico de mensagens, saber se
 * a mensagem CHEGOU exigia rolar 437px para o lado.
 *
 * ## Medido a 320px, contra dado de produção
 *
 * A tabela mede **906px** num contêiner de **270**. A ordem era
 * `Canal | Destinatario | Mensagem | Status | Data`, e três das cinco colunas
 * nasciam fora de vista:
 *
 * | coluna | começava em | visível? |
 * |---|---|---|
 * | Canal | 25px | sim |
 * | Destinatario | 107px | sim |
 * | Mensagem | 371px | **não** |
 * | Status | **707px** | **não** |
 * | Data | 789px | **não** |
 *
 * Num histórico de envios, "chegou ou falhou" é a razão de a tela existir. E a
 * coluna que ocupava a posição mais nobre era a que menos informa: `Canal`
 * exibia **"WhatsApp" idêntico em 100% das 20 linhas** — o filtro de canal já
 * existe logo acima, para quem precisar separar.
 *
 * Mesma classe do CMU-9 (M8), onde a coluna do valor nascia a 356px. Ali sumia
 * quanto o prestador ganha; aqui, se o cliente recebeu.
 *
 * ## Depois
 *
 * ```
 * Status  ->  25px  (era 707)
 * Data    -> 107px  (era 789)
 * ```
 *
 * O que ficou fora de vista é `Mensagem` (tem `title` com o texto completo) e
 * `Canal` — justamente o redundante.
 *
 * ## O que a correção revelou
 *
 * Com o Status visível, a tela mostrou **11 de 20 linhas em "Falhou"**. Medido
 * em produção: as 30 falhas são **todas** de 03/06 a 25/06; desde 01/07 são 13
 * envios e **zero** falhas. Problema encerrado, não em curso — mas ficou 6
 * semanas invisível porque a coluna nascia fora da tela.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HISTORICO = readFileSync(
  join(process.cwd(), "src/app/(app)/communication/_components/message-history.tsx"),
  "utf8",
);

/** Cabeçalhos na ordem em que a tabela os declara. */
function ordemDasColunas(): string[] {
  return [...HISTORICO.matchAll(/header: "([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("CMN-1 — o histórico mostra primeiro o que importa", () => {
  const ordem = ordemDasColunas();

  it("declara as cinco colunas", () => {
    expect(ordem).toHaveLength(5);
  });

  it("Status é a primeira coluna", () => {
    expect(
      ordem[0],
      `ordem atual: ${ordem.join(" | ")}. A tabela mede 906px num contêiner de ` +
        `270 a 320px: o que não está nas duas primeiras posições nasce fora de ` +
        `vista. "Chegou ou falhou" é a razão de o histórico existir.`,
    ).toBe("Status");
  });

  it("Data vem logo depois", () => {
    expect(ordem[1]).toBe("Data");
  });

  it("Canal é a ÚLTIMA — é a coluna redundante", () => {
    // "WhatsApp" repetido em 100% das linhas ocupava a posição mais nobre. O
    // filtro de canal, logo acima da tabela, já resolve quem precisa separar.
    expect(ordem[ordem.length - 1]).toBe("Canal");
  });

  it("Status e Data vêm antes de Mensagem e Canal", () => {
    // Afirma a REGRA, não só as posições: informação de estado antes de conteúdo.
    const pos = (nome: string) => ordem.indexOf(nome);
    expect(pos("Status")).toBeLessThan(pos("Mensagem"));
    expect(pos("Data")).toBeLessThan(pos("Mensagem"));
    expect(pos("Status")).toBeLessThan(pos("Canal"));
  });
});

describe("a mensagem não colava reticências em texto curto", () => {
  it("não corta com slice antes do truncate", () => {
    // `body.slice(0, 60) + "..."` punha reticências mesmo em "Ok" e brigava com
    // o `truncate`, que já corta no tamanho real da coluna.
    expect(HISTORICO).not.toMatch(/body\.slice\(0, 60\)/);
    expect(HISTORICO).toMatch(/truncate/);
  });

  it("o texto completo fica acessível no title", () => {
    expect(HISTORICO).toMatch(/title=\{row\.original\.body\}/);
  });
});
