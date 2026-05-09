import { describe, it, expect } from "vitest";
import {
  createDeliveryPersonSchema,
  updateDeliveryPersonSchema,
  listDeliveryPersonsSchema,
  createExternalLabSchema,
  updateExternalLabSchema,
  listExternalLabsSchema,
  createLabOrderSchema,
  updateLabOrderStatusSchema,
  listLabOrdersSchema,
  createServiceProviderSchema,
  updateServiceProviderSchema,
  listServiceProvidersSchema,
} from "@/lib/validators/operation";

// ── DeliveryPerson ──────────────────────────────────────────────────────────

describe("createDeliveryPersonSchema", () => {
  it("accepts valid input", () => {
    const result = createDeliveryPersonSchema.safeParse({
      name: "Joao Entregador",
      phone: "(86) 99999-0000",
      email: "joao@email.com",
      active: true,
      notes: "Moto propria",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createDeliveryPersonSchema.safeParse({
      name: "",
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty email (optional)", () => {
    const result = createDeliveryPersonSchema.safeParse({
      name: "Teste",
      email: "",
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = createDeliveryPersonSchema.safeParse({
      name: "Teste",
      email: "not-an-email",
      active: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateDeliveryPersonSchema", () => {
  it("accepts partial update", () => {
    const result = updateDeliveryPersonSchema.safeParse({ name: "Novo Nome" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateDeliveryPersonSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("listDeliveryPersonsSchema", () => {
  it("accepts valid params", () => {
    const result = listDeliveryPersonsSchema.safeParse({ page: 0, pageSize: 50 });
    expect(result.success).toBe(true);
  });

  it("rejects negative page", () => {
    const result = listDeliveryPersonsSchema.safeParse({ page: -1, pageSize: 50 });
    expect(result.success).toBe(false);
  });
});

// ── ExternalLab ─────────────────────────────────────────────────────────────

describe("createExternalLabSchema", () => {
  it("accepts valid input", () => {
    const result = createExternalLabSchema.safeParse({
      name: "Lab Parceiro",
      contact: "Maria",
      phone: "(86) 3322-1100",
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createExternalLabSchema.safeParse({ name: "", active: true });
    expect(result.success).toBe(false);
  });
});

describe("updateExternalLabSchema", () => {
  it("accepts partial update", () => {
    const result = updateExternalLabSchema.safeParse({ contact: "Jose" });
    expect(result.success).toBe(true);
  });
});

describe("listExternalLabsSchema", () => {
  it("accepts valid params with search", () => {
    const result = listExternalLabsSchema.safeParse({
      search: "lab",
      active: true,
      page: 0,
      pageSize: 20,
    });
    expect(result.success).toBe(true);
  });
});

// ── LabOrder ────────────────────────────────────────────────────────────────

describe("createLabOrderSchema", () => {
  it("accepts valid input", () => {
    const result = createLabOrderSchema.safeParse({
      labId: "550e8400-e29b-41d4-a716-446655440000",
      deviceDescription: "iPhone 13",
      problem: "Tela quebrada",
      estimatedCost: 150.0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing labId", () => {
    const result = createLabOrderSchema.safeParse({
      deviceDescription: "iPhone 13",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid labId", () => {
    const result = createLabOrderSchema.safeParse({ labId: "not-uuid" });
    expect(result.success).toBe(false);
  });
});

describe("updateLabOrderStatusSchema", () => {
  it("accepts valid status update", () => {
    const result = updateLabOrderStatusSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      status: "COMPLETED",
      finalCost: 200.0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = updateLabOrderStatusSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      status: "INVALID_STATUS",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid statuses", () => {
    const statuses = ["SENT", "RECEIVED", "IN_PROGRESS", "COMPLETED", "RETURNED", "CANCELLED"];
    for (const status of statuses) {
      const result = updateLabOrderStatusSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        status,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("listLabOrdersSchema", () => {
  it("accepts valid params with filters", () => {
    const result = listLabOrdersSchema.safeParse({
      status: "SENT",
      labId: "550e8400-e29b-41d4-a716-446655440000",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      page: 0,
      pageSize: 50,
    });
    expect(result.success).toBe(true);
  });
});

// ── ServiceProvider ─────────────────────────────────────────────────────────

describe("createServiceProviderSchema", () => {
  it("accepts valid technician", () => {
    const result = createServiceProviderSchema.safeParse({
      name: "Carlos Tecnico",
      type: "technician",
      cpfCnpj: "000.000.000-00",
      phone: "(86) 99999-0000",
      commissionRate: 10.5,
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid consultant", () => {
    const result = createServiceProviderSchema.safeParse({
      name: "Ana Consultora",
      type: "consultant",
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid partner", () => {
    const result = createServiceProviderSchema.safeParse({
      name: "Empresa Parceira",
      type: "partner",
      active: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = createServiceProviderSchema.safeParse({
      name: "Test",
      type: "invalid",
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects commission rate > 100", () => {
    const result = createServiceProviderSchema.safeParse({
      name: "Test",
      type: "technician",
      commissionRate: 101,
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative commission rate", () => {
    const result = createServiceProviderSchema.safeParse({
      name: "Test",
      type: "technician",
      commissionRate: -1,
      active: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateServiceProviderSchema", () => {
  it("accepts partial update", () => {
    const result = updateServiceProviderSchema.safeParse({
      commissionRate: 15,
    });
    expect(result.success).toBe(true);
  });
});

describe("listServiceProvidersSchema", () => {
  it("accepts valid params with type filter", () => {
    const result = listServiceProvidersSchema.safeParse({
      type: "technician",
      active: true,
      page: 0,
      pageSize: 50,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type filter", () => {
    const result = listServiceProvidersSchema.safeParse({
      type: "invalid",
      page: 0,
      pageSize: 50,
    });
    expect(result.success).toBe(false);
  });
});
