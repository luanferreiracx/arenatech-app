import { describe, it, expect } from "vitest";
import {
  createCommissionRuleSchema,
  updateCommissionRuleSchema,
  listCommissionsSchema,
  calculateCommissionsSchema,
  changeCommissionStatusSchema,
  batchChangeStatusSchema,
  commissionReportSchema,
  listCommissionRulesSchema,
} from "@/lib/validators/commission";

// ────────────────────────────────────────────────────────────────────────────
// Commission Rule
// ────────────────────────────────────────────────────────────────────────────

describe("createCommissionRuleSchema", () => {
  it("should accept a valid rule", () => {
    const result = createCommissionRuleSchema.safeParse({
      name: "Vendedor 5%",
      type: "SALE",
      role: "seller",
      ratePercent: 5,
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept a rule with fixed amount", () => {
    const result = createCommissionRuleSchema.safeParse({
      name: "Técnico OS",
      type: "SERVICE_ORDER",
      role: "technician",
      ratePercent: 10,
      fixedAmount: 5.0,
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty name", () => {
    const result = createCommissionRuleSchema.safeParse({
      name: "",
      type: "SALE",
      role: "seller",
      ratePercent: 5,
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid type", () => {
    const result = createCommissionRuleSchema.safeParse({
      name: "Test",
      type: "INVALID",
      role: "seller",
      ratePercent: 5,
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid role", () => {
    const result = createCommissionRuleSchema.safeParse({
      name: "Test",
      type: "SALE",
      role: "invalid_role",
      ratePercent: 5,
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject negative rate", () => {
    const result = createCommissionRuleSchema.safeParse({
      name: "Test",
      type: "SALE",
      role: "seller",
      ratePercent: -1,
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject rate above 100", () => {
    const result = createCommissionRuleSchema.safeParse({
      name: "Test",
      type: "SALE",
      role: "seller",
      ratePercent: 101,
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject negative fixed amount", () => {
    const result = createCommissionRuleSchema.safeParse({
      name: "Test",
      type: "SALE",
      role: "seller",
      ratePercent: 5,
      fixedAmount: -10,
      active: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateCommissionRuleSchema", () => {
  it("should accept partial update", () => {
    const result = updateCommissionRuleSchema.safeParse({
      name: "Updated Name",
    });
    expect(result.success).toBe(true);
  });

  it("should accept empty object", () => {
    const result = updateCommissionRuleSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// List
// ────────────────────────────────────────────────────────────────────────────

describe("listCommissionsSchema", () => {
  it("should accept valid filters", () => {
    const result = listCommissionsSchema.safeParse({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      status: "PENDING",
      type: "SALE",
      periodMonth: 5,
      periodYear: 2026,
      page: 0,
      pageSize: 20,
    });
    expect(result.success).toBe(true);
  });

  it("should accept minimal input", () => {
    const result = listCommissionsSchema.safeParse({
      page: 0,
      pageSize: 20,
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid month", () => {
    const result = listCommissionsSchema.safeParse({
      periodMonth: 13,
      page: 0,
      pageSize: 20,
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid status", () => {
    const result = listCommissionsSchema.safeParse({
      status: "INVALID",
      page: 0,
      pageSize: 20,
    });
    expect(result.success).toBe(false);
  });
});

describe("listCommissionRulesSchema", () => {
  it("should accept valid filters", () => {
    const result = listCommissionRulesSchema.safeParse({
      type: "SALE",
      active: true,
      page: 0,
      pageSize: 50,
    });
    expect(result.success).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Calculate
// ────────────────────────────────────────────────────────────────────────────

describe("calculateCommissionsSchema", () => {
  it("should accept valid period", () => {
    const result = calculateCommissionsSchema.safeParse({
      periodMonth: 5,
      periodYear: 2026,
    });
    expect(result.success).toBe(true);
  });

  it("should reject month 0", () => {
    const result = calculateCommissionsSchema.safeParse({
      periodMonth: 0,
      periodYear: 2026,
    });
    expect(result.success).toBe(false);
  });

  it("should reject month 13", () => {
    const result = calculateCommissionsSchema.safeParse({
      periodMonth: 13,
      periodYear: 2026,
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Status changes
// ────────────────────────────────────────────────────────────────────────────

describe("changeCommissionStatusSchema", () => {
  it("should accept valid input", () => {
    const result = changeCommissionStatusSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      notes: "Motivo da alteração",
    });
    expect(result.success).toBe(true);
  });

  it("should accept without notes", () => {
    const result = changeCommissionStatusSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid uuid", () => {
    const result = changeCommissionStatusSchema.safeParse({
      id: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("batchChangeStatusSchema", () => {
  it("should accept multiple ids", () => {
    const result = batchChangeStatusSchema.safeParse({
      ids: [
        "550e8400-e29b-41d4-a716-446655440000",
        "550e8400-e29b-41d4-a716-446655440001",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty array", () => {
    const result = batchChangeStatusSchema.safeParse({
      ids: [],
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Report
// ────────────────────────────────────────────────────────────────────────────

describe("commissionReportSchema", () => {
  it("should accept valid period", () => {
    const result = commissionReportSchema.safeParse({
      periodMonth: 1,
      periodYear: 2026,
    });
    expect(result.success).toBe(true);
  });

  it("should reject year before 2020", () => {
    const result = commissionReportSchema.safeParse({
      periodMonth: 1,
      periodYear: 2019,
    });
    expect(result.success).toBe(false);
  });
});
