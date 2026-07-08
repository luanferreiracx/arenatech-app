/**
 * osPaymentShortfallCents (OS1): reconciliação de valor no pagamento de OS.
 * A OS só quita quando paidAmount + desconto cobre o total; senão o registro
 * marcaria PAID por menos do que era devido.
 */
import { describe, it, expect } from "vitest";
import {
  osPaymentShortfallCents,
  OS_PAYMENT_TOLERANCE_CENTS,
} from "@/lib/service-order/payment-reconciliation";

describe("osPaymentShortfallCents", () => {
  it("pagamento integral cobre (shortfall 0)", () => {
    expect(
      osPaymentShortfallCents({ orderTotalCents: 50000, paidCents: 50000, discountCents: 0, skip: false }),
    ).toBe(0);
  });

  it("subpagamento grosseiro (R$1 numa OS de R$500) → falta o restante", () => {
    expect(
      osPaymentShortfallCents({ orderTotalCents: 50000, paidCents: 100, discountCents: 0, skip: false }),
    ).toBe(49900);
  });

  it("desconto cobre a diferença → shortfall 0", () => {
    // total 500, cliente paga 450, desconto 50 → coberto.
    expect(
      osPaymentShortfallCents({ orderTotalCents: 50000, paidCents: 45000, discountCents: 5000, skip: false }),
    ).toBe(0);
  });

  it("recompensa adiciona folga → não rejeita (paga total-desconto, desconto inclui reward)", () => {
    // total 500; cliente paga 450 (após desconto manual 50); desconto = 50 + reward 30 = 80.
    // coberto = 450 + 80 = 530 ≥ 500.
    expect(
      osPaymentShortfallCents({ orderTotalCents: 50000, paidCents: 45000, discountCents: 8000, skip: false }),
    ).toBe(0);
  });

  it("garantia / total ≤ 0 (skip) → shortfall 0 mesmo pagando 0", () => {
    expect(
      osPaymentShortfallCents({ orderTotalCents: 50000, paidCents: 0, discountCents: 0, skip: true }),
    ).toBe(0);
    expect(
      osPaymentShortfallCents({ orderTotalCents: 0, paidCents: 0, discountCents: 0, skip: false }),
    ).toBe(0);
  });

  it("tolerância de 1 centavo: faltar 1 centavo é aceito, 2 não", () => {
    expect(OS_PAYMENT_TOLERANCE_CENTS).toBe(1);
    expect(
      osPaymentShortfallCents({ orderTotalCents: 50000, paidCents: 49999, discountCents: 0, skip: false }),
    ).toBe(0);
    expect(
      osPaymentShortfallCents({ orderTotalCents: 50000, paidCents: 49998, discountCents: 0, skip: false }),
    ).toBe(2);
  });
});
