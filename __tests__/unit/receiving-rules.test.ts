/**
 * Regras de recebimento (D6): valor mínimo de parcela + exigir CPF acima de X.
 * Aplicadas no PDV (sale.finalize). Opt-in via TenantReceivingSettings.
 */
import { describe, it, expect } from "vitest";
import { requiresCpf, installmentBelowMinimum } from "@/lib/receiving-rules";

describe("requiresCpf", () => {
  const s = { minInstallmentAmount: 0, requireCpfAbove: 50000 }; // R$500

  it("exige CPF acima do limite", () => {
    expect(requiresCpf(50001, s)).toBe(true);
  });
  it("não exige no limite exato ou abaixo", () => {
    expect(requiresCpf(50000, s)).toBe(false);
    expect(requiresCpf(10000, s)).toBe(false);
  });
  it("0 desliga a regra", () => {
    expect(requiresCpf(999999, { minInstallmentAmount: 0, requireCpfAbove: 0 })).toBe(false);
  });
});

describe("installmentBelowMinimum", () => {
  const s = { minInstallmentAmount: 5000, requireCpfAbove: 0 }; // parcela mín R$50

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
        { minInstallmentAmount: 0, requireCpfAbove: 0 },
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
