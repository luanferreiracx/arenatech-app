import { describe, it, expect } from "vitest";
import {
  defaultSimulatorTiers,
  DEFAULT_SIMULATOR_MAX_INSTALLMENTS,
} from "@/lib/simulator-defaults";
import { updateSimulatorConfigSchema } from "@/lib/validators/simulator";

describe("defaultSimulatorTiers", () => {
  const tiers = defaultSimulatorTiers();

  it("gera 35 tiers (2x..36x)", () => {
    expect(tiers).toHaveLength(35);
    expect(tiers[0]?.installments).toBe(2);
    expect(tiers[tiers.length - 1]?.installments).toBe(36);
  });

  it("2x e 3x tem taxa zero (paridade Laravel)", () => {
    expect(tiers.find((t) => t.installments === 2)?.feePercent).toBe(0);
    expect(tiers.find((t) => t.installments === 3)?.feePercent).toBe(0);
  });

  it("escala a partir de 4x = 1.99 com +0.50 por parcela", () => {
    expect(tiers.find((t) => t.installments === 4)?.feePercent).toBe(1.99);
    expect(tiers.find((t) => t.installments === 5)?.feePercent).toBe(2.49);
    expect(tiers.find((t) => t.installments === 6)?.feePercent).toBe(2.99);
    expect(tiers.find((t) => t.installments === 12)?.feePercent).toBe(5.99);
    expect(tiers.find((t) => t.installments === 36)?.feePercent).toBe(17.99);
  });

  it("default de parcelas e 12", () => {
    expect(DEFAULT_SIMULATOR_MAX_INSTALLMENTS).toBe(12);
  });
});

describe("updateSimulatorConfigSchema", () => {
  const valid = {
    creditAvistaFeePercent: 3.5,
    debitFeePercent: 1.99,
    maxInstallments: 12,
    tiers: [
      { installments: 2, feePercent: 0 },
      { installments: 12, feePercent: 5.99 },
    ],
  };

  it("aceita config valida", () => {
    expect(updateSimulatorConfigSchema.safeParse(valid).success).toBe(true);
  });

  it("rejeita maxInstallments fora de 2..36", () => {
    expect(
      updateSimulatorConfigSchema.safeParse({ ...valid, maxInstallments: 1 })
        .success,
    ).toBe(false);
    expect(
      updateSimulatorConfigSchema.safeParse({ ...valid, maxInstallments: 37 })
        .success,
    ).toBe(false);
  });

  it("rejeita taxa acima de 99.99", () => {
    expect(
      updateSimulatorConfigSchema.safeParse({
        ...valid,
        creditAvistaFeePercent: 100,
      }).success,
    ).toBe(false);
  });

  it("rejeita tier com parcela fora de 2..36", () => {
    expect(
      updateSimulatorConfigSchema.safeParse({
        ...valid,
        tiers: [{ installments: 1, feePercent: 0 }],
      }).success,
    ).toBe(false);
  });
});
