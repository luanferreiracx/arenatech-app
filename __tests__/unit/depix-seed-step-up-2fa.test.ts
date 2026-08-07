/**
 * E8-10 (Etapa 8, Módulo 9 — Carteira DePix): `revealMnemonic` devolvia a seed
 * da carteira **sem exigir 2FA**.
 *
 * ## A assimetria
 *
 * | operação | exige 2FA? | o que permite |
 * |---|---|---|
 * | `depixTransaction.createWithdraw` | **sim** | sacar um valor, com cap diário e trilha |
 * | `depixWallet.revealMnemonic` | **não** | mover o saldo INTEIRO, por fora do sistema |
 *
 * A seed dá controle **total e permanente** da carteira: quem a tem importa no
 * SideSwap e move tudo sem passar por limite diário, sem cap e sem trilha nossa.
 * Sacar R$ 1 exigia segundo fator; revelar a chave que dispensa o saque, não.
 *
 * ## Provado no navegador
 *
 * Antes, com a senha de login correta e **nenhum** código 2FA:
 *
 * ```
 * HTTP 200 | mnemonic retornado
 * ```
 *
 * Depois:
 *
 * ```
 * sem código   -> 400 (schema recusa)
 * código errado -> 412 "Revelar a frase de recuperacao exige 2FA"
 * ```
 *
 * ## Escala medida
 *
 * A carteira `arena-tech` é **custodial** (a seed vive no volume; basta a senha
 * de login) e movimentou **R$ 130.808** em 330 transações. **5 admins** podem
 * chamar esta procedure — e só **2 têm 2FA ativo**.
 *
 * As duas carteiras `non_custodial` estão melhor por construção: a seed é
 * cifrada com uma passphrase que o servidor não conhece. Mesmo assim ganharam o
 * step-up — defesa em profundidade, e o custo é o mesmo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/depix-wallet.ts"),
  "utf8",
);
const CARD = readFileSync(
  join(
    process.cwd(),
    "src/app/(app)/depix-wallet/_components/recovery-phrase-card.tsx",
  ),
  "utf8",
);

function corpoDaProcedure(nome: string): string {
  const i = ROUTER.search(new RegExp(`^ {2}${nome}: \\w+Procedure`, "m"));
  if (i < 0) throw new Error(`procedure ${nome} não encontrada`);
  const resto = ROUTER.slice(i + 10);
  const prox = resto.search(/\n {2}\w+: \w+Procedure/);
  return prox < 0 ? ROUTER.slice(i) : ROUTER.slice(i, i + 10 + prox);
}

describe("E8-10 — revelar a seed exige o mesmo segundo fator que o saque", () => {
  const corpo = corpoDaProcedure("revealMnemonic");

  it("chama o step-up 2FA", () => {
    expect(
      corpo,
      "a seed permite mover o saldo INTEIRO por fora do sistema — sem cap, sem " +
        "limite diário, sem trilha. Se o saque de R$ 1 exige 2FA, isto também.",
    ).toMatch(/verifyUserTwoFactor\(ctx\.session\.user\.id, input\.twoFactorCode\)/);
  });

  it("o código é obrigatório no schema, não opcional", () => {
    // Opcional deixaria o caminho antigo (só senha) funcionando.
    const schema = ROUTER.slice(
      ROUTER.indexOf("const revealMnemonicSchema"),
      ROUTER.indexOf("const revealMnemonicSchema") + 500,
    );
    expect(schema).toMatch(/twoFactorCode: z\.string\(\)/);
    expect(schema).not.toMatch(/twoFactorCode: z\.string\(\)[\s\S]{0,40}\.optional\(\)/);
  });

  it("quem não tem 2FA recebe instrução, não erro genérico", () => {
    expect(corpo).toMatch(/not_enrolled/);
    expect(corpo).toMatch(/PRECONDITION_FAILED/);
  });

  it("mantém o rate limit que já existia", () => {
    expect(corpo).toMatch(/rlSensitiveWallet\(/);
  });

  it("mantém a senha/passphrase — 2FA é ADICIONAL, não substituto", () => {
    expect(corpo).toMatch(/compareSync\(/);
    expect(corpo).toMatch(/passphrase/);
  });
});

describe("a tela pede o código (senão o admin não consegue usar)", () => {
  it("tem campo de 2FA no diálogo", () => {
    expect(CARD).toMatch(/depix-wallet-mnemonic-2fa/);
    expect(CARD).toMatch(/autoComplete="one-time-code"/);
  });

  it("o botão só habilita com senha E código", () => {
    expect(CARD).toMatch(/const podeRevelar =/);
    expect(CARD).toMatch(/revealTwoFactor\.trim\(\)\.length >= 6/);
  });

  it("o payload é montado num lugar só", () => {
    // O botão e o Enter mandavam formas diferentes antes; um helper evita que
    // um caminho envie o código e o outro esqueça.
    expect(CARD).toMatch(/const payloadRevelar = \(\)/);
    const chamadas = CARD.match(/revealMnemonicMutation\.mutate\(/g) ?? [];
    const viaHelper = CARD.match(/revealMnemonicMutation\.mutate\(payloadRevelar\(\)\)/g) ?? [];
    expect(viaHelper.length).toBe(chamadas.length);
  });
});
