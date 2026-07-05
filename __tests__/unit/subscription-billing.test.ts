import { describe, it, expect } from "vitest";
import { nextPeriodEnd, snapshotAmountCents } from "@/lib/billing/subscription";

describe("nextPeriodEnd", () => {
  const now = new Date("2026-07-05T12:00:00.000Z");

  it("avança 1 mês a partir de hoje quando não há vencimento (primeira cobrança)", () => {
    const end = nextPeriodEnd({ cycle: "MONTHLY", currentPeriodEnd: null, now });
    expect(end.toISOString()).toBe("2026-08-05T12:00:00.000Z");
  });

  it("avança 1 ano no ciclo anual", () => {
    const end = nextPeriodEnd({ cycle: "YEARLY", currentPeriodEnd: null, now });
    expect(end.toISOString()).toBe("2027-07-05T12:00:00.000Z");
  });

  it("renovação antecipada soma ao vencimento futuro (não perde dias)", () => {
    const future = new Date("2026-07-20T12:00:00.000Z");
    const end = nextPeriodEnd({ cycle: "MONTHLY", currentPeriodEnd: future, now });
    expect(end.toISOString()).toBe("2026-08-20T12:00:00.000Z");
  });

  it("assinatura já vencida parte de hoje (não credita período retroativo)", () => {
    const past = new Date("2026-06-01T12:00:00.000Z");
    const end = nextPeriodEnd({ cycle: "MONTHLY", currentPeriodEnd: past, now });
    expect(end.toISOString()).toBe("2026-08-05T12:00:00.000Z");
  });
});

describe("snapshotAmountCents", () => {
  it("usa o preço mensal no ciclo mensal", () => {
    expect(snapshotAmountCents({ cycle: "MONTHLY", monthlyCents: 9900, yearlyCents: 99000 })).toBe(9900);
  });

  it("usa o preço anual no ciclo anual quando definido", () => {
    expect(snapshotAmountCents({ cycle: "YEARLY", monthlyCents: 9900, yearlyCents: 99000 })).toBe(99000);
  });

  it("no anual sem yearlyPrice, cai para 12× o mensal", () => {
    expect(snapshotAmountCents({ cycle: "YEARLY", monthlyCents: 9900, yearlyCents: null })).toBe(118800);
  });
});
