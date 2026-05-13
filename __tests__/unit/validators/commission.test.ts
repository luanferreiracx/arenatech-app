import { describe, it, expect } from "vitest";
import {
  createRuleSchema,
  updateRuleSchema,
  listRulesSchema,
  listCommissionsSchema,
  calculateCommissionsSchema,
  changeStatusSchema,
  batchChangeStatusSchema,
  reportSchema,
  commissionTypeEnum,
  commissionStatusEnum,
  COMMISSION_TYPE_LABELS,
  COMMISSION_STATUS_LABELS,
} from "@/lib/validators/commission";

describe("commissionTypeEnum", () => {
  it("aceita tipos validos", () => {
    expect(commissionTypeEnum.safeParse("SALE").success).toBe(true);
    expect(commissionTypeEnum.safeParse("SERVICE_ORDER").success).toBe(true);
  });
  it("rejeita tipo invalido", () => {
    expect(commissionTypeEnum.safeParse("INVALID").success).toBe(false);
  });
});

describe("createRuleSchema", () => {
  const valid = { name: "Comissao vendedor", type: "SALE" as const, role: "seller", ratePercent: 10 };

  it("aceita input valido", () => {
    expect(createRuleSchema.safeParse(valid).success).toBe(true);
  });
  it("aceita com fixedAmount", () => {
    expect(createRuleSchema.safeParse({ ...valid, fixedAmount: 500 }).success).toBe(true);
  });
  it("rejeita nome vazio", () => {
    expect(createRuleSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });
  it("rejeita taxa negativa", () => {
    expect(createRuleSchema.safeParse({ ...valid, ratePercent: -1 }).success).toBe(false);
  });
  it("rejeita taxa acima de 100", () => {
    expect(createRuleSchema.safeParse({ ...valid, ratePercent: 101 }).success).toBe(false);
  });
});

describe("updateRuleSchema", () => {
  it("aceita input valido", () => {
    expect(updateRuleSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000", name: "Updated", type: "SALE", role: "seller", ratePercent: 15 }).success).toBe(true);
  });
});

describe("listCommissionsSchema", () => {
  it("aceita filtros vazios", () => {
    expect(listCommissionsSchema.safeParse({}).success).toBe(true);
  });
  it("aceita filtros completos", () => {
    expect(listCommissionsSchema.safeParse({ status: "PENDING", type: "SALE", month: 5, year: 2026 }).success).toBe(true);
  });
  it("rejeita mes invalido", () => {
    expect(listCommissionsSchema.safeParse({ month: 13 }).success).toBe(false);
  });
});

describe("calculateCommissionsSchema", () => {
  it("aceita periodo valido", () => {
    expect(calculateCommissionsSchema.safeParse({ month: 5, year: 2026 }).success).toBe(true);
  });
  it("rejeita mes 0", () => {
    expect(calculateCommissionsSchema.safeParse({ month: 0, year: 2026 }).success).toBe(false);
  });
});

describe("changeStatusSchema", () => {
  it("aceita transicao valida", () => {
    expect(changeStatusSchema.safeParse({ commissionId: "550e8400-e29b-41d4-a716-446655440000", status: "APPROVED" }).success).toBe(true);
  });
  it("rejeita status PENDING", () => {
    expect(changeStatusSchema.safeParse({ commissionId: "550e8400-e29b-41d4-a716-446655440000", status: "PENDING" }).success).toBe(false);
  });
});

describe("batchChangeStatusSchema", () => {
  it("aceita lote valido", () => {
    expect(batchChangeStatusSchema.safeParse({ commissionIds: ["550e8400-e29b-41d4-a716-446655440000"], status: "APPROVED" }).success).toBe(true);
  });
  it("rejeita lote vazio", () => {
    expect(batchChangeStatusSchema.safeParse({ commissionIds: [], status: "APPROVED" }).success).toBe(false);
  });
});

describe("reportSchema", () => {
  it("aceita periodo valido", () => {
    expect(reportSchema.safeParse({ month: 12, year: 2026 }).success).toBe(true);
  });
});

describe("labels", () => {
  it("tem labels para tipos", () => {
    expect(Object.keys(COMMISSION_TYPE_LABELS)).toHaveLength(2);
  });
  it("tem labels para status", () => {
    expect(Object.keys(COMMISSION_STATUS_LABELS)).toHaveLength(4);
  });
});
