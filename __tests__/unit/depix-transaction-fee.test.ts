/**
 * Trava as estimativas locais de taxas DePix.
 * Saque e deposito usam preview PixPay.
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

describe("estimatePixPayWithdrawFee — dados reais de prod (2026-05-31)", () => {
  // (valor em REAIS, fee real cobrada pela PixPay em REAIS)
  const samples: Array<[number, number]> = [
    [100, 1.99],
    [250, 4.25],
    [400, 6.96],
    [800, 13.5],
    [999, 15.49],
    [1000, 15.5],
    [2000, 25.5],
    [5000, 55.5],
  ];

  for (const [reais, feeReal] of samples) {
    it(`R$ ${reais} -> R$ ${feeReal.toFixed(2)} (tolerancia R$ 0,25)`, () => {
      const got = estimatePixPayWithdrawFee(reais * 100);
      const expectedCents = Math.round(feeReal * 100);
      expect(Math.abs(got - expectedCents)).toBeLessThanOrEqual(25);
    });
  }

  it("piso de R$ 1,99 ate R$ 100", () => {
    expect(estimatePixPayWithdrawFee(1000)).toBe(199); // R$ 10
    expect(estimatePixPayWithdrawFee(5000)).toBe(199); // R$ 50
    expect(estimatePixPayWithdrawFee(10000)).toBe(199); // R$ 100
  });

  it("retorna zero para valores invalidos ou zerados", () => {
    expect(estimatePixPayWithdrawFee(0)).toBe(0);
    expect(estimatePixPayWithdrawFee(-1)).toBe(0);
  });
});

describe("estimatePixPayDepositFee", () => {
  it("R$ 100 -> R$ 1,49 (0,99 fixo + 0,5% = 0,50)", () => {
    expect(estimatePixPayDepositFee(10000)).toBe(149);
  });
  it("R$ 1000 -> R$ 5,99 (0,99 + 5,00)", () => {
    expect(estimatePixPayDepositFee(100000)).toBe(599);
  });
  it("R$ 5000 -> R$ 25,99 (0,99 + 25,00)", () => {
    expect(estimatePixPayDepositFee(500000)).toBe(2599);
  });
});

describe("calcWithdrawFromNet — inversa (input = liquido)", () => {
  it("tenant central: gross = net + taxa PixPay (Arena=0)", () => {
    const r = calcWithdrawFromNet(10000, cfgCentral); // R$ 100 net
    expect(r.feeArenaTechCents).toBe(0);
    expect(r.feePixPayEstimatedCents).toBe(199);
    expect(r.grossCents).toBe(10199);
    expect(r.netCents).toBe(10000);
  });

  it("tenant normal R$ 100 net: empilha taxas", () => {
    const r = calcWithdrawFromNet(10000, cfgNormal);
    expect(r.netCents).toBe(10000);
    expect(r.feePixPayEstimatedCents).toBe(199);
    expect(r.feeArenaTechCents).toBeGreaterThan(99);
    expect(r.grossCents - r.feeArenaTechCents - r.feePixPayEstimatedCents).toBe(10000);
  });

  it("R$ 1000 net (tenant central) bate na faixa > R$ 800: gross = 1015.50", () => {
    const r = calcWithdrawFromNet(100000, cfgCentral);
    expect(r.feePixPayEstimatedCents).toBe(1550); // R$ 15,50
    expect(r.grossCents).toBe(101550);
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
  it("tenant central R$ 100: feeArena=0, feePixPay=149 (0.99 + 0.5%)", () => {
    const r = calcDepositFee(10000, cfgCentral);
    expect(r.feeArenaTechCents).toBe(0);
    expect(r.feePixPayEstimatedCents).toBe(149);
    expect(r.netCents).toBe(10000 - 149);
  });
});
