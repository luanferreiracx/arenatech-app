/**
 * Tradução das recusas da Eulen.
 *
 * As mensagens abaixo são as REAIS de produção, copiadas de
 * `tenant_depix_transactions.error_message`. Elas chegavam cruas na tela do
 * lojista, em inglês, mandando contatar "our support team" — que é o suporte da
 * Eulen, onde o lojista não tem conta. Com clientes de verdade isso vira uma
 * porta que não abre.
 */
import { describe, it, expect } from "vitest";
import {
  translateProviderWithdrawError,
  MAX_USER_FACING_ERROR_LENGTH,
} from "@/lib/depix/provider-error";

describe("translateProviderWithdrawError", () => {
  it("limite diário: diz de quem é o limite, quanto sobrou e o que fazer", () => {
    // TXW20260730-00003, saque de R$ 2.171,50 recusado.
    const traduzido = translateProviderWithdrawError(
      "Daily withdrawal limit exceeded for pix key '59292397000185'. Daily volume in cents: 500000. Withdrawal limit in cents: 600000.",
    );
    expect(traduzido.scope).toBe("withdrawal");
    // A chave não é repetida na mensagem: ela já está na tela do saque e na
    // linha da transação, e cada caractere aqui disputa o teto do sanitizador.
    expect(traduzido.message).toMatch(/R\$\s*5\.000,00/);
    expect(traduzido.message).toMatch(/R\$\s*6\.000,00/);
    // O que ainda cabe hoje é a informação acionável.
    expect(traduzido.message).toMatch(/R\$\s*1\.000,00/);
  });

  it("limite diário estourado por completo não promete espaço que não existe", () => {
    const traduzido = translateProviderWithdrawError(
      "Daily withdrawal limit exceeded for pix key 'x'. Daily volume in cents: 600000. Withdrawal limit in cents: 600000.",
    );
    expect(traduzido.message).toMatch(/limite dela acabou/i);
  });

  it("recusa de conformidade: diz que é da conta da Arena e não manda repetir", () => {
    // TXW20260731-00002 e mais quatro em 2026-07-06.
    const traduzido = translateProviderWithdrawError(
      "After a compliance review, we are unable to process this withdrawal at this time. If you believe this decision was made in error, please contact our support team and provide the following reference number: 019fba96564c72b78aa1e414ff24442e",
    );
    expect(traduzido.scope).toBe("arena_account");
    expect(traduzido.message).toMatch(/repetir não resolve/i);
    expect(traduzido.message).toMatch(/suporte da Arena/i);
    // Diz de quem é o problema: a conta é nossa, a loja dele não tem culpa.
    expect(traduzido.message).toMatch(/não na sua loja/i);
    // A referência é o que o suporte pede; perdê-la trava o chamado.
    expect(traduzido.message).toContain("019fba96564c72b78aa1e414ff24442e");
  });

  it("bloqueio por pendência financeira: não culpa o cadastro do lojista", () => {
    // TXW20260610-00001.
    const traduzido = translateProviderWithdrawError(
      "Withdraw blocked. Please pay the pending fees to continue. To add credits and avoid blocks, go to https://liquidx.pro/withdraws and add credits.",
    );
    expect(traduzido.scope).toBe("arena_account");
    expect(traduzido.message).toMatch(/pendência financeira da conta da Arena/i);
    // O link é do painel da Arena no provedor; mandar o lojista para lá é pior
    // que não dizer nada.
    expect(traduzido.message).not.toContain("liquidx.pro");
  });

  it("mensagem desconhecida é repassada inteira, sem diagnóstico inventado", () => {
    const traduzido = translateProviderWithdrawError("Something entirely new happened");
    expect(traduzido.scope).toBe("unknown");
    expect(traduzido.message).toBe("Something entirely new happened");
  });

  it("preserva sempre o original para log e suporte", () => {
    const cru =
      "Daily withdrawal limit exceeded for pix key 'k'. Daily volume in cents: 1. Withdrawal limit in cents: 2.";
    expect(translateProviderWithdrawError(cru).original).toBe(cru);
  });

  it("toda tradução sobrevive ao sanitizador do caminho do saque", () => {
    // Armadilha real: `sanitizeUserError` troca por uma frase genérica qualquer
    // erro acima de MAX_USER_FACING_ERROR_LENGTH. Uma tradução comprida demais
    // seria descartada em silêncio e o lojista leria "Falha ao iniciar saque no
    // provedor PIX" — a tradução inteira não teria servido para nada.
    const reais = [
      "Daily withdrawal limit exceeded for pix key '59292397000185'. Daily volume in cents: 500000. Withdrawal limit in cents: 600000.",
      "After a compliance review, we are unable to process this withdrawal at this time. If you believe this decision was made in error, please contact our support team and provide the following reference number: 019fba96564c72b78aa1e414ff24442e",
      "Withdraw blocked. Please pay the pending fees to continue. To add credits and avoid blocks, go to https://liquidx.pro/withdraws and add credits.",
    ];
    for (const cru of reais) {
      const { message } = translateProviderWithdrawError(cru);
      expect(message.length, `mensagem longa demais: ${message}`).toBeLessThanOrEqual(
        MAX_USER_FACING_ERROR_LENGTH,
      );
    }
  });
});
