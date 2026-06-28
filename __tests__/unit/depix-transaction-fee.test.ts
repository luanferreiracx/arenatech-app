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
  calcDepositSettlement,
  calcDepositSplitFeePercent,
  calcOnchainWithdrawFee,
  estimateArenaFeeFromNet,
  DEPIX_LIMITS,
} from "@/lib/services/depix-transaction-fee";

const cfgNormal = {
  entryFeeFixed: 99,
  entryFeePercent: 1.5,
  exitFeeFixed: 99,
  exitFeePercent: 1.7,
  onchainFeeFixed: 0,
  onchainFeePercent: 0,
};
const cfgCentral = {
  entryFeeFixed: 0,
  entryFeePercent: 0,
  exitFeeFixed: 0,
  exitFeePercent: 0,
  onchainFeeFixed: 0,
  onchainFeePercent: 0,
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

describe("calcDepositSettlement — sobre o on-chain (ja liquido da Eulen)", () => {
  it("NAO re-desconta a taxa Eulen: net = onchain - feeArena (central feeArena=0)", () => {
    // R$9,01 chegou on-chain (Eulen ja tirou os R$0,99 do PIX de R$10).
    const r = calcDepositSettlement(901, cfgCentral);
    expect(r.feeArenaTechCents).toBe(0);
    expect(r.netCents).toBe(901); // credita o valor cheio que chegou — sem cobranca dupla
  });

  it("retem so a taxa Arena Tech sobre o on-chain", () => {
    // onchain R$100,00; feeArena = 99 + 1,5% = 99 + 150 = 249.
    const r = calcDepositSettlement(10000, cfgNormal);
    expect(r.feeArenaTechCents).toBe(99 + 150);
    expect(r.netCents).toBe(10000 - (99 + 150));
  });

  it("nunca negativo", () => {
    const r = calcDepositSettlement(50, cfgNormal);
    expect(r.netCents).toBe(0);
  });
});

describe("calcDepositSplitFeePercent — taxa fixo+% -> % equivalente p/ o split Eulen", () => {
  it("R$100 com (R$0,99 + 1,5%) -> 2,49%", () => {
    // fee = 99 + 1,5% de 10000 = 99 + 150 = 249c; 249/10000 = 2,49%.
    expect(calcDepositSplitFeePercent(10000, cfgNormal)).toBe(2.49);
  });

  it("central / fee zero -> 0 (sem split)", () => {
    expect(calcDepositSplitFeePercent(10000, cfgCentral)).toBe(0);
  });

  it("valor maior dilui o fixo (% cai)", () => {
    // R$1000: fee = 99 + 1,5% de 100000 = 99 + 1500 = 1599c; 1599/100000 = 1,599% -> 1,6%.
    expect(calcDepositSplitFeePercent(100000, cfgNormal)).toBe(1.6);
  });

  it("valor pequeno faz o fixo pesar (% sobe) mas nunca >= 100", () => {
    const p = calcDepositSplitFeePercent(100, cfgNormal); // R$1
    expect(p).toBeGreaterThan(2.49);
    expect(p).toBeLessThan(100);
  });

  it("gross <= 0 -> 0", () => {
    expect(calcDepositSplitFeePercent(0, cfgNormal)).toBe(0);
  });
});

describe("estimateArenaFeeFromNet — reconstroi a taxa Arena a partir do liquido (ledger)", () => {
  it("aproxima a taxa que o split separou (round-trip ~)", () => {
    // gross R$100 -> fee 249c -> net 9751c. A partir do net, reconstroi ~249c.
    const fee = estimateArenaFeeFromNet(9751, cfgNormal);
    expect(fee).toBeGreaterThanOrEqual(248);
    expect(fee).toBeLessThanOrEqual(251);
  });

  it("central / fee zero -> 0", () => {
    expect(estimateArenaFeeFromNet(10000, cfgCentral)).toBe(0);
  });

  it("net <= 0 -> 0", () => {
    expect(estimateArenaFeeFromNet(0, cfgNormal)).toBe(0);
  });
});

describe("calcOnchainWithdrawFee — taxa propria do saque on-chain (independente do PIX)", () => {
  it("default 0 -> sem taxa (mesmo com taxa PIX configurada)", () => {
    // cfgNormal tem exitFee mas onchainFee = 0.
    expect(calcOnchainWithdrawFee(10000, cfgNormal)).toBe(0);
  });

  it("fixo + % proprios", () => {
    const cfg = { ...cfgNormal, onchainFeeFixed: 50, onchainFeePercent: 2 };
    // 50c + 2% de 10000 = 50 + 200 = 250c.
    expect(calcOnchainWithdrawFee(10000, cfg)).toBe(250);
  });

  it("so percentual", () => {
    const cfg = { ...cfgNormal, onchainFeeFixed: 0, onchainFeePercent: 1 };
    expect(calcOnchainWithdrawFee(20000, cfg)).toBe(200);
  });

  it("valor <= 0 -> 0", () => {
    const cfg = { ...cfgNormal, onchainFeeFixed: 99, onchainFeePercent: 2 };
    expect(calcOnchainWithdrawFee(0, cfg)).toBe(0);
  });
});
