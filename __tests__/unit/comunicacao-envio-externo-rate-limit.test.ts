/**
 * E8-6 (Etapa 8, Módulo 6 — Comunicação): dos três caminhos que disparam envio
 * externo, **só um tinha rate limit**.
 *
 * | procedure | dispara `dispatchMessage` | rate limit (antes) |
 * |---|---|---|
 * | `send` | sim | **sim** |
 * | `resend` | sim | não |
 * | `sendToCustomer` | sim | não |
 *
 * O `send` documenta a razão do teto: um loop dispara pelo WhatsApp Business da
 * loja e arrisca o **ban do número na Meta**, que é recurso **compartilhado** —
 * derruba o atendimento real junto. Os irmãos não herdaram a proteção.
 *
 * ## Por que o `resend` é o pior dos dois
 *
 * O status volta a `FAILED` quando o envio falha, então uma mensagem que a
 * Evolution API recusa é reenviável **indefinidamente**. Produção tem **30
 * FAILED**, 23 delas com `Evolution API HTTP 404` — munição pronta.
 *
 * (Localmente o dispatch cai em mock automático quando não há credencial, e o
 * status vira `SENT` no primeiro resend. Isso mascarou o loop na primeira
 * medição — foi preciso ler o código de `whatsapp-cloud-service.ts` para
 * entender que em produção, com credencial e falha real, o status permanece
 * `FAILED`.)
 *
 * ## A chave é ÚNICA de propósito
 *
 * `enforceRateLimit` compõe a chave como `trpc:{path}:{userId}`. Passar o nome
 * de cada procedure daria **três baldes de 60 = 180/hora** pelo mesmo número.
 * O recurso protegido é o **número**, não a procedure.
 *
 * Provado no navegador: depois de esgotar o teto com 62 `send` (60 ok, 2 × 429),
 * o `sendToCustomer` respondeu **429** — o balde é compartilhado.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/communication.ts"),
  "utf8",
);

/** Recorta o corpo de uma procedure (evita casar com a irmã ao lado). */
function corpoDaProcedure(nome: string): string {
  const i = ROUTER.search(new RegExp(`^ {2}${nome}: (?:tenant|tenantAdmin|admin)Procedure`, "m"));
  if (i < 0) throw new Error(`procedure ${nome} não encontrada`);
  const resto = ROUTER.slice(i + 10);
  const prox = resto.search(/\n {2}\w+: (?:tenant|tenantAdmin|admin)Procedure/);
  return prox < 0 ? ROUTER.slice(i) : ROUTER.slice(i, i + 10 + prox);
}

/**
 * Descobre no código quem dispara envio externo, em vez de manter lista à mão —
 * uma lista à mão foi como o guardião do M7 deixou `stock.ts` de fora.
 */
function procedimentosQueEnviam(): string[] {
  const nomes: string[] = [];
  const re = /^ {2}(\w+): (?:tenant|tenantAdmin|admin)Procedure/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ROUTER)) !== null) {
    if (/dispatchMessage\(\{/.test(corpoDaProcedure(m[1]!))) nomes.push(m[1]!);
  }
  return nomes;
}

describe("E8-6 — todo caminho que envia para fora tem teto", () => {
  const ENVIAM = procedimentosQueEnviam();

  it("encontra os caminhos de envio no código (lista não escrita à mão)", () => {
    expect(ENVIAM.length).toBeGreaterThanOrEqual(3);
  });

  for (const nome of ENVIAM) {
    it(`${nome} passa pelo rate limit`, () => {
      expect(
        corpoDaProcedure(nome),
        `${nome} chama dispatchMessage e dispara pelo número WhatsApp Business ` +
          `compartilhado. Sem teto, um loop arrisca o BAN do número na Meta — ` +
          `e o ban derruba o atendimento real junto.`,
      ).toMatch(/await rlSend\(ctx, RL_ENVIO_EXTERNO\)/);
    });
  }
});

describe("o teto protege o NÚMERO, não a procedure", () => {
  it("os três caminhos compartilham a mesma chave", () => {
    const chaves = ROUTER.match(/rlSend\(ctx, ([^)]+)\)/g) ?? [];
    const distintas = new Set(chaves);
    expect(
      distintas.size,
      "chaves distintas dariam um balde de 60 por procedure — 180/hora pelo " +
        "mesmo número. `enforceRateLimit` compõe `trpc:{path}:{userId}`.",
    ).toBe(1);
  });

  it("a chave é uma constante nomeada, não string solta em cada ponto", () => {
    expect(ROUTER).toMatch(/const RL_ENVIO_EXTERNO = /);
  });
});

describe("o opt-out continua no ponto certo (não regrediu)", () => {
  it("o gate LGPD vive dentro de dispatchMessage", () => {
    // Fonte única: toda procedure que envia atravessa o dispatch, então o
    // opt-out não pode ser esquecido num caminho novo — foi essa decisão que
    // impediu o E8-6 de ser também um furo de LGPD.
    const i = ROUTER.indexOf("async function dispatchMessage");
    const corpo = ROUTER.slice(i, i + 900);
    expect(corpo).toMatch(/isRecipientUnsubscribed\(/);
  });
});
