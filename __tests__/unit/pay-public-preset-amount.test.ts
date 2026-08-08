import { describe, it, expect } from "vitest";
import { buildPayUrl, parsePayAmountCents } from "@/lib/payment-link/pay-url";
import { resolveChargeAmountCents } from "@/lib/payment-link/charge-amount";

/**
 * Link com valor fixo (`?valor=150.00`): o cliente não digita nada, o valor já
 * vem do operador.
 *
 * Esta modalidade quebrou inteira porque a tela decidia o que ENVIAR pelo mesmo
 * flag que decide se o campo é EDITÁVEL: com o valor travado ela mandava `null`,
 * o servidor lia 0 e recusava com "Valor mínimo de R$ 10,00" — com o botão
 * habilitado, porque a validação do cliente usava o preset certo.
 *
 * Por isso os testes abaixo percorrem o caminho inteiro (monta a URL → lê →
 * decide o valor a enviar) em vez de checar cada função isolada: era exatamente
 * na junção que estava o defeito.
 */
describe("cobrança com valor fixo na URL", () => {
  it("envia o valor do operador quando o campo está travado", () => {
    const url = buildPayUrl("https://app.pdvdepix.app", "tok123", 15000);
    const lido = parsePayAmountCents(new URL(url).searchParams.get("valor"));

    // amountOpen=false: o cliente não digitou nada, e não deve digitar.
    expect(resolveChargeAmountCents({ presetCents: lido, amountOpen: false, enteredCents: 0 })).toBe(
      15000,
    );
  });

  it("envia o que o cliente digitou quando o valor é livre", () => {
    expect(
      resolveChargeAmountCents({ presetCents: null, amountOpen: true, enteredCents: 2500 }),
    ).toBe(2500);
  });

  it("ignora o que foi digitado se o operador travou o valor", () => {
    // Protege o combinado: um preset na URL não pode ser sobreposto por um
    // valor residual no estado da tela.
    expect(
      resolveChargeAmountCents({ presetCents: 15000, amountOpen: false, enteredCents: 999999 }),
    ).toBe(15000);
  });

  it("devolve null quando não há valor nenhum, para o servidor recusar", () => {
    expect(
      resolveChargeAmountCents({ presetCents: null, amountOpen: false, enteredCents: 0 }),
    ).toBeNull();
  });

  it("preserva os centavos de ponta a ponta", () => {
    // R$ 150,50 virando R$ 150,00 (ou R$ 1,50) é o tipo de erro que só aparece
    // na conta do cliente.
    const url = buildPayUrl("https://app.pdvdepix.app", "tok123", 15050);
    const lido = parsePayAmountCents(new URL(url).searchParams.get("valor"));
    expect(resolveChargeAmountCents({ presetCents: lido, amountOpen: false, enteredCents: 0 })).toBe(
      15050,
    );
  });
});
