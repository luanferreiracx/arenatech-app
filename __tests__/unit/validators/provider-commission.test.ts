import { describe, it, expect } from "vitest";
import {
  createProviderSchema,
  updateProviderSchema,
  listProvidersSchema,
  createContractSchema,
  updateProviderRulesSchema,
  providerRuleSchema,
  apurarProviderSchema,
  closeApuracaoSchema,
  createReversalSchema,
  deleteReversalSchema,
  toggleUncoveredDaySchema,
  getProviderDetailSchema,
  previewCommissionByPeriodSchema,
  providerProfileEnum,
  providerBondTypeEnum,
  reversalTypeEnum,
  apuracaoStatusEnum,
  PROVIDER_PROFILE_LABELS,
  PROVIDER_BOND_TYPE_LABELS,
  APURACAO_STATUS_LABELS,
  REVERSAL_TYPE_LABELS,
  COMMISSION_CATEGORY_LABELS,
  validateBracketSet,
} from "@/lib/validators/provider-commission";

describe("validateBracketSet", () => {
  it("accepts an empty set", () => {
    expect(validateBracketSet([]).ok).toBe(true);
  });

  it("accepts a single open bracket", () => {
    expect(validateBracketSet([{ rangeMin: 0, rangeMax: null }]).ok).toBe(true);
  });

  it("accepts contiguous brackets ending open", () => {
    const result = validateBracketSet([
      { rangeMin: 0, rangeMax: 5000 },
      { rangeMin: 5000, rangeMax: 10000 },
      { rangeMin: 10000, rangeMax: null },
    ]);
    expect(result.ok).toBe(true);
  });

  it("sorts before validating (order-independent)", () => {
    const result = validateBracketSet([
      { rangeMin: 5000, rangeMax: null },
      { rangeMin: 0, rangeMax: 5000 },
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects overlap", () => {
    expect(validateBracketSet([
      { rangeMin: 0, rangeMax: 6000 },
      { rangeMin: 5000, rangeMax: null },
    ]).ok).toBe(false);
  });

  it("rejects gap", () => {
    expect(validateBracketSet([
      { rangeMin: 0, rangeMax: 4000 },
      { rangeMin: 5000, rangeMax: null },
    ]).ok).toBe(false);
  });

  it("rejects max <= min", () => {
    expect(validateBracketSet([{ rangeMin: 5000, rangeMax: 5000 }]).ok).toBe(false);
  });

  it("rejects open bracket that is not last", () => {
    expect(validateBracketSet([
      { rangeMin: 0, rangeMax: null },
      { rangeMin: 5000, rangeMax: null },
    ]).ok).toBe(false);
  });
});

const validUuid = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

describe("provider-commission validators", () => {
  // ── Enums ──

  describe("providerProfileEnum", () => {
    it("accepts SELLER", () => {
      expect(providerProfileEnum.parse("SELLER")).toBe("SELLER");
    });
    it("accepts TECHNICIAN", () => {
      expect(providerProfileEnum.parse("TECHNICIAN")).toBe("TECHNICIAN");
    });
    it("rejects invalid", () => {
      expect(() => providerProfileEnum.parse("INTERN")).toThrow();
    });
  });

  describe("providerBondTypeEnum", () => {
    it("accepts MEI", () => {
      expect(providerBondTypeEnum.parse("MEI")).toBe("MEI");
    });
    it("accepts CLT", () => {
      expect(providerBondTypeEnum.parse("CLT")).toBe("CLT");
    });
    it("rejects invalid", () => {
      expect(() => providerBondTypeEnum.parse("PJ")).toThrow();
    });
  });

  describe("reversalTypeEnum", () => {
    it("accepts all 8 types", () => {
      const types = [
        "RETURN_SAME_MONTH", "RETURN_LATER_MONTH",
        "CHARGEBACK_PROVIDER", "CHARGEBACK_FRAUD",
        "DEFAULT_60D", "WARRANTY_REFUND",
        "WARRANTY_PARTIAL", "MANUAL_ADJUSTMENT",
      ];
      for (const t of types) {
        expect(reversalTypeEnum.parse(t)).toBe(t);
      }
    });
    it("rejects invalid", () => {
      expect(() => reversalTypeEnum.parse("UNKNOWN")).toThrow();
    });
  });

  describe("apuracaoStatusEnum", () => {
    it("accepts OPEN/CLOSED/PAID/CANCELLED", () => {
      for (const s of ["OPEN", "CLOSED", "PAID", "CANCELLED"]) {
        expect(apuracaoStatusEnum.parse(s)).toBe(s);
      }
    });
  });

  // ── Create Provider ──

  describe("createProviderSchema", () => {
    it("accepts valid input", () => {
      const result = createProviderSchema.parse({
        userId: validUuid,
        profile: "SELLER",
        bondType: "MEI",
        cnpjMei: "00.000.000/0001-00",
      });
      expect(result.userId).toBe(validUuid);
      expect(result.profile).toBe("SELLER");
    });

    it("rejects missing userId", () => {
      expect(() =>
        createProviderSchema.parse({ profile: "SELLER", bondType: "MEI" }),
      ).toThrow();
    });

    it("rejects invalid profile", () => {
      expect(() =>
        createProviderSchema.parse({
          userId: validUuid,
          profile: "MANAGER",
          bondType: "MEI",
        }),
      ).toThrow();
    });
  });

  // ── Update Provider ──

  describe("updateProviderSchema", () => {
    it("accepts valid partial update", () => {
      const result = updateProviderSchema.parse({
        id: validUuid,
        active: false,
      });
      expect(result.id).toBe(validUuid);
      expect(result.active).toBe(false);
    });
  });

  // ── List Providers ──

  describe("listProvidersSchema", () => {
    it("accepts empty input", () => {
      const result = listProvidersSchema.parse({});
      expect(result).toBeDefined();
    });

    it("accepts filters", () => {
      const result = listProvidersSchema.parse({
        active: true,
        profile: "TECHNICIAN",
        bondType: "CLT",
      });
      expect(result.profile).toBe("TECHNICIAN");
    });
  });

  // ── Contract ──

  describe("createContractSchema", () => {
    it("accepts valid contract", () => {
      const result = createContractSchema.parse({
        providerId: validUuid,
        startDate: "2026-01-01",
        dailyMeal: 25.5,
        dailyTransport: 15,
        monthlyCellphone: 50,
        allowanceCap: 2000,
      });
      expect(result.providerId).toBe(validUuid);
      expect(result.dailyMeal).toBe(25.5);
    });

    it("rejects missing startDate", () => {
      expect(() =>
        createContractSchema.parse({ providerId: validUuid }),
      ).toThrow();
    });
  });

  // ── Provider Rule ──

  describe("providerRuleSchema", () => {
    it("accepts valid rule", () => {
      const result = providerRuleSchema.parse({
        category: "produto_acessorio",
        scope: "normal",
        rangeMin: 0,
        rangeMax: 5000,
        rate: 10,
      });
      expect(result.category).toBe("produto_acessorio");
      expect(result.rate).toBe(10);
    });

    it("accepts rule with _delete", () => {
      const result = providerRuleSchema.parse({
        id: validUuid,
        category: "produto_acessorio",
        scope: "normal",
        rangeMin: 0,
        rate: 5,
        _delete: true,
      });
      expect(result._delete).toBe(true);
    });

    it("aplica defaults dos novos eixos (percent/profit/own)", () => {
      const r = providerRuleSchema.parse({
        category: "produto_acessorio",
        scope: "normal",
        rangeMin: 0,
        rate: 10,
      });
      expect(r.valueType).toBe("PERCENT");
      expect(r.base).toBe("PROFIT");
      expect(r.source).toBe("OWN");
    });

    it("rejects rate negativo", () => {
      expect(() =>
        providerRuleSchema.parse({
          category: "produto_acessorio",
          scope: "normal",
          rangeMin: 0,
          rate: -1,
        }),
      ).toThrow();
    });

    it("rejects unknown category", () => {
      expect(() =>
        providerRuleSchema.parse({
          category: "x",
          scope: "normal",
          rangeMin: 0,
          rate: 5,
        }),
      ).toThrow();
    });

    it("rejects unknown scope", () => {
      expect(() =>
        providerRuleSchema.parse({
          category: "produto_acessorio",
          scope: "proprio",
          rangeMin: 0,
          rate: 5,
        }),
      ).toThrow();
    });
  });

  // ── Update Rules ──

  describe("updateProviderRulesSchema", () => {
    it("accepts contiguous brackets", () => {
      const result = updateProviderRulesSchema.parse({
        contractId: validUuid,
        rules: [
          { category: "produto_acessorio", scope: "normal", rangeMin: 0, rangeMax: 5000, rate: 10 },
          { category: "produto_acessorio", scope: "normal", rangeMin: 5000, rangeMax: null, rate: 15 },
          { category: "produto_aparelho", scope: "premium", rangeMin: 0, rangeMax: null, rate: 5 },
        ],
      });
      expect(result.rules).toHaveLength(3);
    });

    it("accepts empty rules", () => {
      const result = updateProviderRulesSchema.parse({
        contractId: validUuid,
        rules: [],
      });
      expect(result.rules).toHaveLength(0);
    });

    it("rejects overlapping brackets in same category+scope", () => {
      expect(() =>
        updateProviderRulesSchema.parse({
          contractId: validUuid,
          rules: [
            { category: "produto_acessorio", scope: "normal", rangeMin: 0, rangeMax: 6000, rate: 10 },
            { category: "produto_acessorio", scope: "normal", rangeMin: 5000, rangeMax: null, rate: 15 },
          ],
        }),
      ).toThrow();
    });

    it("rejects gap between brackets", () => {
      expect(() =>
        updateProviderRulesSchema.parse({
          contractId: validUuid,
          rules: [
            { category: "produto_acessorio", scope: "normal", rangeMin: 0, rangeMax: 4000, rate: 10 },
            { category: "produto_acessorio", scope: "normal", rangeMin: 5000, rangeMax: null, rate: 15 },
          ],
        }),
      ).toThrow();
    });

    it("rejects open bracket that is not the last", () => {
      expect(() =>
        updateProviderRulesSchema.parse({
          contractId: validUuid,
          rules: [
            { category: "produto_acessorio", scope: "normal", rangeMin: 0, rangeMax: null, rate: 10 },
            { category: "produto_acessorio", scope: "normal", rangeMin: 5000, rangeMax: null, rate: 15 },
          ],
        }),
      ).toThrow();
    });

    it("allows same rangeMin across different scopes (independent bracket sets)", () => {
      const result = updateProviderRulesSchema.parse({
        contractId: validUuid,
        rules: [
          { category: "produto_acessorio", scope: "normal", rangeMin: 0, rangeMax: null, rate: 10 },
          { category: "produto_acessorio", scope: "premium", rangeMin: 0, rangeMax: null, rate: 20 },
        ],
      });
      expect(result.rules).toHaveLength(2);
    });

    // ── Novos eixos: tipo/base/origem ──

    it("rejects rate > 100 quando percentual", () => {
      expect(() =>
        updateProviderRulesSchema.parse({
          contractId: validUuid,
          rules: [{ category: "produto_acessorio", scope: "normal", rangeMin: 0, rangeMax: null, rate: 101 }],
        }),
      ).toThrow();
    });

    it("aceita valor fixo por unidade acima de 100 (R$/unidade, sem faixa)", () => {
      const r = updateProviderRulesSchema.parse({
        contractId: validUuid,
        rules: [
          { category: "produto_aparelho", scope: "normal", valueType: "FIXED_PER_UNIT", rangeMin: 0, rate: 500 },
        ],
      });
      expect(r.rules[0]!.valueType).toBe("FIXED_PER_UNIT");
      expect(r.rules[0]!.rate).toBe(500);
    });

    it("rejeita faixa (rangeMax) em regra de valor fixo", () => {
      expect(() =>
        updateProviderRulesSchema.parse({
          contractId: validUuid,
          rules: [
            { category: "produto_aparelho", scope: "normal", valueType: "FIXED_PER_UNIT", rangeMin: 0, rangeMax: 1000, rate: 50 },
          ],
        }),
      ).toThrow();
    });

    it("rejeita base GROSS_NET com valor fixo", () => {
      expect(() =>
        updateProviderRulesSchema.parse({
          contractId: validUuid,
          rules: [
            { category: "produto_aparelho", scope: "normal", valueType: "FIXED_PER_UNIT", base: "GROSS_NET", rangeMin: 0, rate: 50 },
          ],
        }),
      ).toThrow();
    });

    it("aceita percentual sobre valor total (GROSS_NET) em produto", () => {
      const r = updateProviderRulesSchema.parse({
        contractId: validUuid,
        rules: [
          { category: "produto_acessorio", scope: "normal", base: "GROSS_NET", rangeMin: 0, rangeMax: null, rate: 5 },
        ],
      });
      expect(r.rules[0]!.base).toBe("GROSS_NET");
    });

    it("rejeita origem loja em categoria de servico de execucao", () => {
      expect(() =>
        updateProviderRulesSchema.parse({
          contractId: validUuid,
          rules: [
            { category: "servico_at_sem_peca", scope: "normal", source: "STORE", rangeMin: 0, rangeMax: null, rate: 5 },
          ],
        }),
      ).toThrow();
    });

    it("rejeita valor fixo em categoria de servico de execucao", () => {
      expect(() =>
        updateProviderRulesSchema.parse({
          contractId: validUuid,
          rules: [
            { category: "servico_at_com_peca", scope: "normal", valueType: "FIXED_PER_UNIT", rangeMin: 0, rate: 5 },
          ],
        }),
      ).toThrow();
    });

    it("aceita base lucro/total nas categorias de AT de execucao", () => {
      const r = updateProviderRulesSchema.parse({
        contractId: validUuid,
        rules: [
          { category: "servico_at_sem_peca", scope: "normal", base: "GROSS_NET", rangeMin: 0, rangeMax: null, rate: 5 },
          { category: "servico_at_com_peca", scope: "normal", base: "PROFIT", rangeMin: 0, rangeMax: null, rate: 8 },
          { category: "intermediacao_at", scope: "normal", base: "GROSS_NET", rangeMin: 0, rangeMax: null, rate: 3 },
        ],
      });
      expect(r.rules).toHaveLength(3);
      expect(r.rules[0]!.base).toBe("GROSS_NET");
    });

    it("faixas de origens diferentes acumulam separado (own vs store)", () => {
      const r = updateProviderRulesSchema.parse({
        contractId: validUuid,
        rules: [
          { category: "produto_acessorio", scope: "normal", source: "OWN", rangeMin: 0, rangeMax: null, rate: 10 },
          { category: "produto_acessorio", scope: "normal", source: "STORE", rangeMin: 0, rangeMax: null, rate: 2 },
        ],
      });
      expect(r.rules).toHaveLength(2);
    });

    // ── Participacao em AT (servico_at_loja) ──

    it("aceita servico_at_loja com % sobre lucro, origem loja", () => {
      const r = updateProviderRulesSchema.parse({
        contractId: validUuid,
        rules: [
          { category: "servico_at_loja", scope: "normal", source: "STORE", base: "PROFIT", rangeMin: 0, rangeMax: null, rate: 3 },
        ],
      });
      expect(r.rules[0]!.category).toBe("servico_at_loja");
    });

    it("aceita servico_at_loja com % sobre o valor total (GROSS_NET)", () => {
      const r = updateProviderRulesSchema.parse({
        contractId: validUuid,
        rules: [
          { category: "servico_at_loja", scope: "normal", source: "STORE", base: "GROSS_NET", rangeMin: 0, rangeMax: null, rate: 2 },
        ],
      });
      expect(r.rules[0]!.base).toBe("GROSS_NET");
    });

    it("aceita servico_at_loja com valor fixo por servico", () => {
      const r = updateProviderRulesSchema.parse({
        contractId: validUuid,
        rules: [
          { category: "servico_at_loja", scope: "normal", source: "STORE", valueType: "FIXED_PER_UNIT", rangeMin: 0, rate: 10 },
        ],
      });
      expect(r.rules[0]!.valueType).toBe("FIXED_PER_UNIT");
      expect(r.rules[0]!.rate).toBe(10);
    });

    it("rejeita servico_at_loja com origem propria (participacao e sempre loja)", () => {
      expect(() =>
        updateProviderRulesSchema.parse({
          contractId: validUuid,
          rules: [
            { category: "servico_at_loja", scope: "normal", source: "OWN", rangeMin: 0, rangeMax: null, rate: 3 },
          ],
        }),
      ).toThrow();
    });
  });

  // ── Apuracao ──

  describe("apurarProviderSchema", () => {
    it("accepts valid input", () => {
      const result = apurarProviderSchema.parse({
        providerId: validUuid,
        month: 5,
        year: 2026,
      });
      expect(result.month).toBe(5);
    });

    it("rejects month 0", () => {
      expect(() =>
        apurarProviderSchema.parse({ providerId: validUuid, month: 0, year: 2026 }),
      ).toThrow();
    });

    it("rejects month 13", () => {
      expect(() =>
        apurarProviderSchema.parse({ providerId: validUuid, month: 13, year: 2026 }),
      ).toThrow();
    });
  });

  describe("previewCommissionByPeriodSchema", () => {
    it("accepts a valid date range", () => {
      const result = previewCommissionByPeriodSchema.parse({
        providerId: validUuid,
        startDate: "2026-07-01",
        endDate: "2026-07-15",
      });
      expect(result.startDate).toBe("2026-07-01");
      expect(result.endDate).toBe("2026-07-15");
    });

    it("accepts a single-day range (start == end)", () => {
      expect(() =>
        previewCommissionByPeriodSchema.parse({
          providerId: validUuid,
          startDate: "2026-07-10",
          endDate: "2026-07-10",
        }),
      ).not.toThrow();
    });

    it("rejects end before start", () => {
      expect(() =>
        previewCommissionByPeriodSchema.parse({
          providerId: validUuid,
          startDate: "2026-07-20",
          endDate: "2026-07-10",
        }),
      ).toThrow();
    });

    it("rejects malformed dates", () => {
      expect(() =>
        previewCommissionByPeriodSchema.parse({
          providerId: validUuid,
          startDate: "07/2026",
          endDate: "2026-07-10",
        }),
      ).toThrow();
    });
  });

  // ── Reversals ──

  describe("createReversalSchema", () => {
    it("accepts valid reversal", () => {
      const result = createReversalSchema.parse({
        providerId: validUuid,
        factDate: "2026-05-15",
        type: "MANUAL_ADJUSTMENT",
        amount: 150.50,
      });
      expect(result.amount).toBe(150.5);
    });

    it("rejects zero amount", () => {
      expect(() =>
        createReversalSchema.parse({
          providerId: validUuid,
          factDate: "2026-05-15",
          type: "MANUAL_ADJUSTMENT",
          amount: 0,
        }),
      ).toThrow();
    });

    it("rejects invalid type", () => {
      expect(() =>
        createReversalSchema.parse({
          providerId: validUuid,
          factDate: "2026-05-15",
          type: "INVALID_TYPE",
          amount: 100,
        }),
      ).toThrow();
    });
  });

  // ── Uncovered Days ──

  describe("toggleUncoveredDaySchema", () => {
    it("accepts valid input", () => {
      const result = toggleUncoveredDaySchema.parse({
        providerId: validUuid,
        day: "2026-05-15",
        reason: "Feriado",
      });
      expect(result.day).toBe("2026-05-15");
    });

    it("accepts without reason", () => {
      const result = toggleUncoveredDaySchema.parse({
        providerId: validUuid,
        day: "2026-05-15",
      });
      expect(result.reason).toBeUndefined();
    });
  });

  // ── Labels ──

  describe("label maps", () => {
    it("has all profile labels", () => {
      expect(PROVIDER_PROFILE_LABELS.SELLER).toBe("Vendedor");
      expect(PROVIDER_PROFILE_LABELS.TECHNICIAN).toBe("Tecnico");
    });

    it("has all bond type labels", () => {
      expect(PROVIDER_BOND_TYPE_LABELS.MEI).toBe("MEI");
      expect(PROVIDER_BOND_TYPE_LABELS.CLT).toBe("CLT");
    });

    it("has all apuracao status labels", () => {
      expect(APURACAO_STATUS_LABELS.OPEN).toBe("Aberta");
      expect(APURACAO_STATUS_LABELS.CLOSED).toBe("Fechada");
      expect(APURACAO_STATUS_LABELS.PAID).toBe("Paga");
      expect(APURACAO_STATUS_LABELS.CANCELLED).toBe("Cancelada");
    });

    it("has all reversal type labels", () => {
      expect(Object.keys(REVERSAL_TYPE_LABELS)).toHaveLength(8);
    });

    it("has all commission category labels", () => {
      expect(COMMISSION_CATEGORY_LABELS.produto_acessorio).toBe("Acessorio");
      expect(COMMISSION_CATEGORY_LABELS.intermediacao_at).toBe("Intermediacao de OS (captou o servico)");
      expect(COMMISSION_CATEGORY_LABELS.servico_at_loja).toBe("Participacao em AT da loja (OS de outros)");
    });
  });

  // ── Get Provider Detail ──

  describe("getProviderDetailSchema", () => {
    it("accepts valid input", () => {
      const result = getProviderDetailSchema.parse({
        providerId: validUuid,
        month: 1,
        year: 2026,
      });
      expect(result.providerId).toBe(validUuid);
    });
  });
});
