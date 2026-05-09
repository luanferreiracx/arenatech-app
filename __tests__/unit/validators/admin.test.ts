import { describe, it, expect } from "vitest";
import {
  createPlanSchema,
  updatePlanSchema,
  listPlansSchema,
  listTenantsSchema,
  updateTenantStatusSchema,
  updateTenantPlanSchema,
  createPreRegistrationSchema,
  listPreRegistrationsSchema,
  approvePreRegistrationSchema,
  rejectPreRegistrationSchema,
  adminReportSchema,
} from "@/lib/validators/admin";

// ── Plans ───────────────────────────────────────────────────────────────────

describe("createPlanSchema", () => {
  it("accepts valid plan", () => {
    const result = createPlanSchema.safeParse({
      name: "Plano Basic",
      slug: "basic",
      description: "Plano basico",
      monthlyPrice: 99.90,
      yearlyPrice: 999.90,
      maxUsers: 5,
      maxImeiQueries: 50,
      status: "ACTIVE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createPlanSchema.safeParse({
      name: "",
      slug: "basic",
      monthlyPrice: 99.90,
      maxUsers: 5,
      maxImeiQueries: 50,
      status: "ACTIVE",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid slug format", () => {
    const result = createPlanSchema.safeParse({
      name: "Test",
      slug: "Invalid Slug!",
      monthlyPrice: 99.90,
      maxUsers: 5,
      maxImeiQueries: 50,
      status: "ACTIVE",
    });
    expect(result.success).toBe(false);
  });

  it("accepts slug with hyphens and numbers", () => {
    const result = createPlanSchema.safeParse({
      name: "Test",
      slug: "plano-pro-2",
      monthlyPrice: 199.90,
      maxUsers: 10,
      maxImeiQueries: 100,
      status: "ACTIVE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative monthly price", () => {
    const result = createPlanSchema.safeParse({
      name: "Test",
      slug: "test",
      monthlyPrice: -10,
      maxUsers: 5,
      maxImeiQueries: 50,
      status: "ACTIVE",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status", () => {
    const result = createPlanSchema.safeParse({
      name: "Test",
      slug: "test",
      monthlyPrice: 99.90,
      maxUsers: 5,
      maxImeiQueries: 50,
      status: "INVALID",
    });
    expect(result.success).toBe(false);
  });
});

describe("updatePlanSchema", () => {
  it("accepts partial update", () => {
    const result = updatePlanSchema.safeParse({ monthlyPrice: 149.90 });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updatePlanSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("listPlansSchema", () => {
  it("accepts valid params", () => {
    const result = listPlansSchema.safeParse({ page: 0, pageSize: 20, status: "ACTIVE" });
    expect(result.success).toBe(true);
  });
});

// ── Tenants ─────────────────────────────────────────────────────────────────

describe("listTenantsSchema", () => {
  it("accepts valid params", () => {
    const result = listTenantsSchema.safeParse({
      search: "arena",
      status: "ACTIVE",
      page: 0,
      pageSize: 50,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid statuses", () => {
    const statuses = ["PENDING", "ACTIVE", "SUSPENDED", "CANCELLED"];
    for (const status of statuses) {
      const result = listTenantsSchema.safeParse({ status, page: 0, pageSize: 50 });
      expect(result.success).toBe(true);
    }
  });
});

describe("updateTenantStatusSchema", () => {
  it("accepts valid update", () => {
    const result = updateTenantStatusSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      status: "SUSPENDED",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = updateTenantStatusSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      status: "INVALID",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateTenantPlanSchema", () => {
  it("accepts valid update", () => {
    const result = updateTenantPlanSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      plan: "premium",
    });
    expect(result.success).toBe(true);
  });
});

// ── PreRegistrations ────────────────────────────────────────────────────────

describe("createPreRegistrationSchema", () => {
  it("accepts valid registration", () => {
    const result = createPreRegistrationSchema.safeParse({
      tradeName: "Loja Nova",
      legalName: "Loja Nova LTDA",
      cnpj: "00.000.000/0001-00",
      ownerName: "Fulano de Tal",
      ownerCpf: "000.000.000-00",
      ownerEmail: "fulano@email.com",
      ownerPhone: "(86) 99999-0000",
      planId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal registration (without optional)", () => {
    const result = createPreRegistrationSchema.safeParse({
      tradeName: "Loja Nova",
      ownerName: "Fulano",
      ownerCpf: "00000000000",
      ownerEmail: "fulano@email.com",
      ownerPhone: "(86) 99999-0000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing trade name", () => {
    const result = createPreRegistrationSchema.safeParse({
      tradeName: "",
      ownerName: "Fulano",
      ownerCpf: "00000000000",
      ownerEmail: "fulano@email.com",
      ownerPhone: "(86) 99999-0000",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = createPreRegistrationSchema.safeParse({
      tradeName: "Loja",
      ownerName: "Fulano",
      ownerCpf: "00000000000",
      ownerEmail: "not-email",
      ownerPhone: "(86) 99999-0000",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short CPF", () => {
    const result = createPreRegistrationSchema.safeParse({
      tradeName: "Loja",
      ownerName: "Fulano",
      ownerCpf: "123",
      ownerEmail: "f@e.com",
      ownerPhone: "(86) 99999-0000",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short phone", () => {
    const result = createPreRegistrationSchema.safeParse({
      tradeName: "Loja",
      ownerName: "Fulano",
      ownerCpf: "00000000000",
      ownerEmail: "f@e.com",
      ownerPhone: "123",
    });
    expect(result.success).toBe(false);
  });
});

describe("listPreRegistrationsSchema", () => {
  it("accepts valid params", () => {
    const result = listPreRegistrationsSchema.safeParse({
      status: "PENDING",
      page: 0,
      pageSize: 50,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid statuses", () => {
    const statuses = ["PENDING", "APPROVED", "REJECTED"];
    for (const status of statuses) {
      const result = listPreRegistrationsSchema.safeParse({ status, page: 0, pageSize: 50 });
      expect(result.success).toBe(true);
    }
  });
});

describe("approvePreRegistrationSchema", () => {
  it("accepts valid approve", () => {
    const result = approvePreRegistrationSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      notes: "Verificado via telefone",
    });
    expect(result.success).toBe(true);
  });

  it("accepts without notes", () => {
    const result = approvePreRegistrationSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

describe("rejectPreRegistrationSchema", () => {
  it("accepts valid reject with notes", () => {
    const result = rejectPreRegistrationSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      notes: "CNPJ invalido",
    });
    expect(result.success).toBe(true);
  });
});

// ── Reports ─────────────────────────────────────────────────────────────────

describe("adminReportSchema", () => {
  it("accepts empty params", () => {
    const result = adminReportSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts date range", () => {
    const result = adminReportSchema.safeParse({
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });
});
