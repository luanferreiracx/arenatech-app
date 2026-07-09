/**
 * Guard de configuração de cartão no finalize (R1/R2 da auditoria PDV).
 * Política: bloquear sempre — cartão exige forma configurada + adquirente +
 * bandeira + tipo; débito não parcela.
 */
import { describe, it, expect } from "vitest";
import {
  isCardPayment,
  cardPaymentConfigError,
  type CardGuardPayment,
} from "@/server/services/card-payment-guard";

const fullCard: CardGuardPayment = {
  method: "cartao_credito",
  paymentMethodId: "pm-1",
  acquirerId: "acq-1",
  cardBrandId: "brand-1",
  cardKind: "CREDIT",
  installments: 3,
};

describe("isCardPayment", () => {
  it("detecta pelo tipo do PaymentMethod", () => {
    expect(isCardPayment({ method: "x" }, "CREDIT_CARD")).toBe(true);
    expect(isCardPayment({ method: "x" }, "DEBIT_CARD")).toBe(true);
  });
  it("detecta pelo método fallback", () => {
    expect(isCardPayment({ method: "cartao_credito" }, null)).toBe(true);
    expect(isCardPayment({ method: "cartao_debito" }, null)).toBe(true);
  });
  it("detecta por cardKind presente", () => {
    expect(isCardPayment({ method: "qualquer", cardKind: "CREDIT" }, null)).toBe(true);
  });
  it("não-cartão: dinheiro/pix", () => {
    expect(isCardPayment({ method: "dinheiro" }, null)).toBe(false);
    expect(isCardPayment({ method: "pix" }, "PIX")).toBe(false);
  });
});

describe("cardPaymentConfigError", () => {
  it("cartão completo passa", () => {
    expect(cardPaymentConfigError(fullCard, "CREDIT_CARD")).toBeNull();
  });

  it("não-cartão nunca bloqueia", () => {
    expect(cardPaymentConfigError({ method: "dinheiro" }, null)).toBeNull();
    expect(cardPaymentConfigError({ method: "pix", paymentMethodId: null }, "PIX")).toBeNull();
  });

  it("cartão sem forma configurada (fallback) é bloqueado", () => {
    const err = cardPaymentConfigError({ method: "cartao_credito" }, null);
    expect(err).toMatch(/forma de pagamento configurada/i);
  });

  it("cartão sem adquirente/bandeira é bloqueado", () => {
    const err = cardPaymentConfigError(
      { method: "cartao_credito", paymentMethodId: "pm-1", cardKind: "CREDIT" },
      "CREDIT_CARD",
    );
    expect(err).toMatch(/adquirente e bandeira/i);
  });

  it("falta bandeira também bloqueia", () => {
    const err = cardPaymentConfigError(
      { ...fullCard, cardBrandId: null },
      "CREDIT_CARD",
    );
    expect(err).toMatch(/adquirente e bandeira/i);
  });

  it("débito com parcelas>1 é bloqueado", () => {
    const err = cardPaymentConfigError(
      { ...fullCard, cardKind: "DEBIT", installments: 3 },
      "DEBIT_CARD",
    );
    expect(err).toMatch(/débito não aceita parcelamento/i);
  });

  it("débito 1x passa", () => {
    expect(
      cardPaymentConfigError(
        { ...fullCard, cardKind: "DEBIT", installments: 1 },
        "DEBIT_CARD",
      ),
    ).toBeNull();
  });

  it("crédito parcelado passa", () => {
    expect(cardPaymentConfigError({ ...fullCard, installments: 12 }, "CREDIT_CARD")).toBeNull();
  });
});
