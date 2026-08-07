/**
 * E8-9 (Etapa 8, Módulo 8 — 2FA): `regenerateBackupCodes` não tinha rate limit.
 *
 * A procedure devolve **10 códigos que fazem bypass permanente do TOTP** — são
 * a chave reserva da conta, e a conta é o que protege o saque DePix
 * (`createWithdraw` exige step-up 2FA).
 *
 * A única barreira era `verifyTotp` sobre 6 dígitos: 1 milhão de combinações,
 * **sem teto**. Medido no navegador contra a cópia de produção:
 *
 * ```
 * 25 tentativas seguidas -> 0 bloqueios
 * ```
 *
 * Quem tiver a sessão (cookie roubado, máquina do balcão aberta) força bruta e
 * sai com bypass definitivo — sem precisar da senha.
 *
 * O `startDisable`, logo abaixo no mesmo arquivo, **já protegia** a operação
 * irmã com 5/hora. A regra existia e não foi aplicada aqui — décima terceira
 * ocorrência do padrão neste programa.
 *
 * Verificado depois do fix:
 *
 * ```
 * 10 tentativas -> 412,412,412,412,412,429,429,429,429,429
 * ```
 *
 * ## O que NÃO é achado (medido e descartado)
 *
 * - **`confirm` também não tem teto**, mas só ativa 2FA na própria conta do
 *   atacante — não há ganho.
 * - **O step-up de saque é sólido**: `two-factor-verify.ts` usa
 *   `verifyTotpReturningCounter` + `markTotpCounterUsedAtomic` (anti-replay
 *   real: o mesmo código não autoriza dois saques) e consome backup code
 *   atomicamente.
 * - **O login com 2FA tem rate limit próprio** (`recordFailedAttempt` /
 *   `clearRateLimit` em `auth.ts`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/two-factor.ts"),
  "utf8",
);
const STEP_UP = readFileSync(
  join(process.cwd(), "src/lib/auth/two-factor-verify.ts"),
  "utf8",
);

function corpoDaProcedure(nome: string): string {
  const i = ROUTER.search(new RegExp(`^ {2}${nome}: \\w+Procedure`, "m"));
  if (i < 0) throw new Error(`procedure ${nome} não encontrada`);
  const resto = ROUTER.slice(i + 10);
  const prox = resto.search(/\n {2}\w+: \w+Procedure/);
  return prox < 0 ? ROUTER.slice(i) : ROUTER.slice(i, i + 10 + prox);
}

/**
 * Procedures que emitem ou revogam credencial de bypass do 2FA. Estas são as
 * que um atacante com sessão tentaria forçar.
 */
const EMITEM_OU_REVOGAM_CREDENCIAL = [
  "regenerateBackupCodes",
  "startDisable",
  "confirmDisable",
  "disableWithBackupCode",
];

describe("E8-9 — quem mexe na credencial de 2FA tem teto", () => {
  for (const nome of EMITEM_OU_REVOGAM_CREDENCIAL) {
    it(`${nome} aplica rate limit`, () => {
      expect(
        corpoDaProcedure(nome),
        `${nome} emite ou revoga a barreira que protege o saque DePix. Sem teto, ` +
          `quem tiver a sessão força bruta os 6 dígitos do TOTP — medido: 25 ` +
          `tentativas, 0 bloqueios.`,
      ).toMatch(/rateLimit\(\{/);
    });
  }

  it("regenerateBackupCodes usa o mesmo teto do startDisable", () => {
    const regen = corpoDaProcedure("regenerateBackupCodes");
    expect(regen).toMatch(/limit: 5/);
    expect(regen).toMatch(/TOO_MANY_REQUESTS/);
  });

  it("a chave do rate limit é por USUÁRIO, não global", () => {
    // Chave global deixaria um atacante travar o 2FA de todo mundo.
    expect(corpoDaProcedure("regenerateBackupCodes")).toMatch(
      /key: `2fa-regen-backup:\$\{ctx\.session\.user\.id\}`/,
    );
  });
});

describe("o step-up de saque continua sólido (não regrediu)", () => {
  it("usa TOTP com anti-replay, não a variante simples", () => {
    expect(
      STEP_UP,
      "o step-up autoriza SAQUE. Sem anti-replay, o mesmo código de 30s " +
        "autoriza dois saques.",
    ).toMatch(/verifyTotpReturningCounter\(/);
    expect(STEP_UP).toMatch(/markTotpCounterUsedAtomic\(/);
  });

  it("consome backup code atomicamente", () => {
    expect(STEP_UP).toMatch(/consumeBackupCodeAtomic\(/);
  });

  it("falha ao decifrar o segredo é tratada como código inválido", () => {
    // Fail-safe: erro de cifra não pode virar "autorizado".
    // Ancora no `try`, não em "decryptSecret" — a primeira ocorrência dessa
    // string é o IMPORT no topo, e a janela a partir dele não alcança o
    // tratamento. Detalhe que fez esta asserção falhar com o código correto.
    const i = STEP_UP.indexOf("secret = decryptSecret(");
    expect(STEP_UP.slice(i, i + 500)).toMatch(/return \{ ok: false, reason: "invalid_code" \}/);
  });
});
