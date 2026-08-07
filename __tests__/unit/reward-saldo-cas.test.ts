/**
 * E8-5 (Etapa 8, Módulo 5 — Fidelidade): `debitCashback` decidia quanto
 * debitar com `Math.min` sobre um **snapshot**, e escrevia sem CAS.
 *
 * Dois cancelamentos concorrentes de ações **diferentes** do mesmo cliente
 * liam R$ 100 cada, ambos calculavam "debitar 80", e o segundo levaria o saldo
 * a **-60**.
 *
 * O CAS que já existia (linha ~540) é na **ação**, não no saldo: impede
 * cancelar a MESMA ação duas vezes, não duas ações distintas do mesmo cliente.
 *
 * ## O que o banco fazia — e por que não bastava
 *
 * Testado contra a cópia de produção: o CHECK
 * `reward_balances_available_non_negative` **barra** o saldo negativo.
 *
 * ```
 * ERROR: new row for relation "reward_balances" violates check constraint
 *        "reward_balances_available_non_negative"
 * DETAIL: Failing row contains (..., -60.00, 0.00, -60.00, ...)
 * ```
 *
 * O dado não corrompe — mas **violação de constraint aborta a transação no
 * Postgres**, e o operador recebe um 500 opaco em vez de "o saldo mudou,
 * atualize". É exatamente a armadilha que o E8-4b já custou uma correção errada.
 *
 * ## O padrão
 *
 * `lockBalance`/`unlockBalance` **já usavam** CAS com `gte` desde 25/07 — o
 * comentário lá diz textualmente que "o clamp `Math.min` usa um snapshot" e que
 * dois unlocks deixavam `lockedBalance = -100`.
 *
 * `debitCashback` é o irmão que ficou de fora. A regra existia e foi esquecida —
 * décima segunda ocorrência do padrão neste programa.
 *
 * Verificado com o fix, contra o banco real: o segundo débito **não casa** o
 * CAS e o saldo fica em 20, sem erro de constraint e sem transação abortada.
 *
 * Impacto medido: **0 registros em produção** (`reward_balances`,
 * `reward_movements`, `reward_campaigns` e `reward_actions` todos vazios). O
 * módulo tem 949 linhas e nenhum uso — correção preventiva antes do primeiro
 * cliente.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/reward.ts"),
  "utf8",
);

/** Corpo de uma função helper (não são procedures tRPC). */
function corpoDaFuncao(nome: string): string {
  const i = ROUTER.indexOf(`async function ${nome}(`);
  if (i < 0) throw new Error(`função ${nome} não encontrada`);
  const resto = ROUTER.slice(i + 10);
  const prox = resto.search(/\nasync function \w+\(|\nexport /);
  return prox < 0 ? ROUTER.slice(i) : ROUTER.slice(i, i + 10 + prox);
}

describe("E8-5 — débito de cashback é ancorado no saldo", () => {
  const corpo = corpoDaFuncao("debitCashback");

  it("usa updateMany com CAS, não update cru", () => {
    expect(
      corpo,
      "`update` cru com `Math.min` de um snapshot deixa dois cancelamentos " +
        "concorrentes decidirem o mesmo débito. O CAS na AÇÃO não cobre: ele " +
        "impede repetir a mesma ação, não duas ações do mesmo cliente.",
    ).toMatch(/updateMany\(/);
    expect(corpo).not.toMatch(/rewardBalance\.update\(\{/);
  });

  it("o CAS ancora no saldo disponível", () => {
    expect(
      corpo,
      "sem `availableBalance: { gte: ... }` o UPDATE passa mesmo com saldo " +
        "insuficiente e o CHECK do banco aborta a transação inteira.",
    ).toMatch(/availableBalance: \{ gte:/);
  });

  it("detecta a corrida em vez de seguir em silêncio", () => {
    expect(corpo).toMatch(/claimed\.count !== 1/);
    expect(corpo).toMatch(/CONFLICT/);
  });
});

describe("os três caminhos de saldo usam o mesmo padrão", () => {
  /**
   * `lock`, `unlock` e `debit` mexem no mesmo registro. Proteger dois e
   * esquecer o terceiro foi exatamente o defeito — este teste existe para que a
   * próxima adição não repita.
   */
  it("toda escrita que DIMINUI saldo usa CAS", () => {
    // `increment` puro é atômico no banco e não depende de snapshot — o
    // `creditCashback` pode usar `update` cru com segurança. O risco é
    // exclusivo de `decrement`, cujo VALOR foi decidido em JavaScript.
    const linhas = ROUTER.split("\n");
    const semCas: number[] = [];

    linhas.forEach((linha, i) => {
      if (!/rewardBalance\.update\(/.test(linha)) return;
      // olha as ~12 linhas seguintes: tem decrement?
      const bloco = linhas.slice(i, i + 12).join("\n");
      if (/decrement:/.test(bloco)) semCas.push(i + 1);
    });

    expect(
      semCas,
      "escrita que DIMINUI saldo sem CAS: use `updateMany` ancorado no valor " +
        "esperado, como `unlockBalance` faz desde 25/07. `increment` puro é " +
        "seguro e não precisa.",
    ).toEqual([]);
  });
});
