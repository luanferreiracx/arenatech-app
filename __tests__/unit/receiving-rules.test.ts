/**
 * Regras de recebimento (D6): valor mínimo de parcela.
 * Aplicada no PDV (sale.finalize). Opt-in via TenantReceivingSettings.
 */
import { describe, it, expect } from "vitest";
import { installmentBelowMinimum } from "@/lib/receiving-rules";

describe("installmentBelowMinimum", () => {
  const s = { minInstallmentAmount: 5000 }; // parcela mín R$50

  it("retorna o mínimo quando uma parcela fica abaixo", () => {
    // R$300 em 12x = R$25/parcela < R$50 → viola
    expect(installmentBelowMinimum([{ amount: 30000, installments: 12 }], s)).toBe(5000);
  });

  it("null quando todas as parcelas respeitam o mínimo", () => {
    // R$600 em 6x = R$100/parcela >= R$50
    expect(installmentBelowMinimum([{ amount: 60000, installments: 6 }], s)).toBeNull();
  });

  it("ignora pagamentos à vista (1x)", () => {
    // R$10 à vista não é parcela
    expect(installmentBelowMinimum([{ amount: 1000, installments: 1 }], s)).toBeNull();
    expect(installmentBelowMinimum([{ amount: 1000 }], s)).toBeNull();
  });

  it("0 desliga a regra", () => {
    expect(
      installmentBelowMinimum(
        [{ amount: 30000, installments: 12 }],
        { minInstallmentAmount: 0 },
      ),
    ).toBeNull();
  });

  it("detecta violação em qualquer um dos pagamentos", () => {
    const r = installmentBelowMinimum(
      [
        { amount: 60000, installments: 6 }, // R$100 ok
        { amount: 20000, installments: 10 }, // R$20 viola
      ],
      s,
    );
    expect(r).toBe(5000);
  });
});
