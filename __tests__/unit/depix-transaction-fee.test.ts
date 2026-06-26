/**
 * Trava as estimativas locais de taxas DePix (provedor Eulen).
 * Deposito: R$ 0,99 fixo. Saque: 1% fixo.
 */
import { describe, it, expect } from "vitest";
import {
  estimatePixPayWithdrawFee,
  estimatePixPayDepositFee,
  calcWithdrawFromNet,
  calcWithdrawFee,
  calcDepositFee,
  DEPIX_LIMITS,
} from "@/lib/services/depix-transaction-fee";

const cfgNormal = {
  entryFeeFixed: 99,
  entryFeePercent: 1.5,
  exitFeeFixed: 99,
  exitFeePercent: 1.7,
};
const cfgCentral = {
  entryFeeFixed: 0,
  entryFeePercent: 0,
  exitFeeFixed: 0,
  exitFeePercent: 0,
};

describe("estimatePixPayWithdrawFee — Eulen 1% fixo", () => {
  it("1% do liquido pretendido", () => {
    expect(estimatePixPayWithdrawFee(10000)).toBe(100); // R$ 100 -> R$ 1,00
    expect(estimatePixPayWithdrawFee(100000)).toBe(1000); // R$ 1000 -> R$ 10,00
    expect(estimatePixPayWithdrawFee(500000)).toBe(5000); // R$ 5000 -> R$ 50,00
  });

  it("retorna zero para valores invalidos ou zerados", () => {
    expect(estimatePixPayWithdrawFee(0)).toBe(0);
    expect(estimatePixPayWithdrawFee(-1)).toBe(0);
  });
});

describe("estimatePixPayDepositFee — Eulen R$ 0,99 fixo", () => {
  it("fixo independente do valor", () => {
    expect(estimatePixPayDepositFee(10000)).toBe(99); // R$ 100
    expect(estimatePixPayDepositFee(100000)).toBe(99); // R$ 1000
    expect(estimatePixPayDepositFee(500000)).toBe(99); // R$ 5000
  });
});

describe("calcWithdrawFromNet — inversa (input = liquido)", () => {
  it("tenant central: gross = net + taxa Eulen (Arena=0)", () => {
    const r = calcWithdrawFromNet(10000, cfgCentral); // R$ 100 net
    expect(r.feeArenaTechCents).toBe(0);
    expect(r.feePixPayEstimatedCents).toBe(100); // 1% de R$ 100
    expect(r.grossCents).toBe(10100);
    expect(r.netCents).toBe(10000);
  });

  it("tenant normal R$ 100 net: empilha taxas", () => {
    const r = calcWithdrawFromNet(10000, cfgNormal);
    expect(r.netCents).toBe(10000);
    expect(r.feePixPayEstimatedCents).toBe(100); // 1% de R$ 100
    expect(r.feeArenaTechCents).toBeGreaterThan(99);
    expect(r.grossCents - r.feeArenaTechCents - r.feePixPayEstimatedCents).toBe(10000);
  });

  it("R$ 1000 net (tenant central): gross = 1010.00 (Eulen 1%)", () => {
    const r = calcWithdrawFromNet(100000, cfgCentral);
    expect(r.feePixPayEstimatedCents).toBe(1000); // R$ 10,00
    expect(r.grossCents).toBe(101000);
  });
});

describe("round-trip: calcWithdrawFee(calcWithdrawFromNet(net)) == net", () => {
  for (const netReais of [10, 50, 100, 250, 500, 1000, 2500, 5000]) {
    it(`R$ ${netReais}`, () => {
      const netCents = netReais * 100;
      const inv = calcWithdrawFromNet(netCents, cfgCentral);
      const fwd = calcWithdrawFee(inv.grossCents, cfgCentral);
      expect(fwd.netCents).toBe(netCents);
    });
  }
});

describe("DEPIX_LIMITS", () => {
  it("min R$ 10,00 / max R$ 5.000,00", () => {
    expect(DEPIX_LIMITS.MIN_CENTS).toBe(1000);
    expect(DEPIX_LIMITS.MAX_CENTS).toBe(500000);
  });
});

describe("calcDepositFee", () => {
  it("tenant central R$ 100: feeArena=0, feeEulen=99 (R$ 0,99 fixo)", () => {
    const r = calcDepositFee(10000, cfgCentral);
    expect(r.feeArenaTechCents).toBe(0);
    expect(r.feePixPayEstimatedCents).toBe(99);
    expect(r.netCents).toBe(10000 - 99);
  });
});
