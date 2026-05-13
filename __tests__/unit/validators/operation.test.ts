import { describe, it, expect } from "vitest";
import {
  createDeliveryPersonSchema,
  updateDeliveryPersonSchema,
  createExternalLabSchema,
  updateExternalLabSchema,
  createLabOrderSchema,
  updateLabOrderStatusSchema,
  createServiceProviderSchema,
  updateServiceProviderSchema,
  listDeliveryPersonsSchema,
  listExternalLabsSchema,
  listLabOrdersSchema,
  listServiceProvidersSchema,
  labOrderStatusEnum,
  LAB_ORDER_STATUS_LABELS,
} from "@/lib/validators/operation";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("createDeliveryPersonSchema", () => {
  it("aceita input valido", () => {
    expect(createDeliveryPersonSchema.safeParse({ name: "Joao" }).success).toBe(true);
  });
  it("aceita com telefone e email", () => {
    expect(createDeliveryPersonSchema.safeParse({ name: "Joao", phone: "86999999999", email: "j@test.com" }).success).toBe(true);
  });
  it("rejeita nome vazio", () => {
    expect(createDeliveryPersonSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("rejeita email invalido", () => {
    expect(createDeliveryPersonSchema.safeParse({ name: "Joao", email: "invalid" }).success).toBe(false);
  });
});

describe("updateDeliveryPersonSchema", () => {
  it("aceita update valido", () => {
    expect(updateDeliveryPersonSchema.safeParse({ id: UUID, name: "Joao Updated", active: false }).success).toBe(true);
  });
});

describe("createExternalLabSchema", () => {
  it("aceita input minimo", () => {
    expect(createExternalLabSchema.safeParse({ name: "Lab Central" }).success).toBe(true);
  });
  it("aceita com endereco", () => {
    expect(createExternalLabSchema.safeParse({ name: "Lab Central", address: { city: "Teresina", state: "PI" } }).success).toBe(true);
  });
});

describe("createLabOrderSchema", () => {
  it("aceita input valido", () => {
    expect(createLabOrderSchema.safeParse({ labId: UUID }).success).toBe(true);
  });
  it("aceita com custo estimado", () => {
    expect(createLabOrderSchema.safeParse({ labId: UUID, estimatedCost: 15000, deviceDescription: "iPhone 15" }).success).toBe(true);
  });
});

describe("updateLabOrderStatusSchema", () => {
  it("aceita mudanca de status", () => {
    expect(updateLabOrderStatusSchema.safeParse({ id: UUID, status: "RECEIVED" }).success).toBe(true);
  });
  it("aceita com custo final", () => {
    expect(updateLabOrderStatusSchema.safeParse({ id: UUID, status: "COMPLETED", finalCost: 20000 }).success).toBe(true);
  });
});

describe("createServiceProviderSchema", () => {
  it("aceita input valido", () => {
    expect(createServiceProviderSchema.safeParse({ name: "Tecnico X", type: "tecnico" }).success).toBe(true);
  });
  it("aceita com taxa de comissao", () => {
    expect(createServiceProviderSchema.safeParse({ name: "Tecnico X", type: "tecnico", commissionRate: 15 }).success).toBe(true);
  });
  it("rejeita taxa acima de 100", () => {
    expect(createServiceProviderSchema.safeParse({ name: "X", type: "t", commissionRate: 150 }).success).toBe(false);
  });
});

describe("labOrderStatusEnum", () => {
  it("aceita todos os status", () => {
    const statuses = ["SENT", "RECEIVED", "IN_PROGRESS", "COMPLETED", "RETURNED", "CANCELLED"];
    for (const s of statuses) {
      expect(labOrderStatusEnum.safeParse(s).success).toBe(true);
    }
  });
});

describe("list schemas", () => {
  it("listDeliveryPersons aceita filtros vazios", () => {
    expect(listDeliveryPersonsSchema.safeParse({}).success).toBe(true);
  });
  it("listExternalLabs aceita busca", () => {
    expect(listExternalLabsSchema.safeParse({ search: "central" }).success).toBe(true);
  });
  it("listLabOrders aceita paginacao", () => {
    expect(listLabOrdersSchema.safeParse({ page: 0, pageSize: 10 }).success).toBe(true);
  });
  it("listServiceProviders aceita tipo", () => {
    expect(listServiceProvidersSchema.safeParse({ type: "tecnico" }).success).toBe(true);
  });
});

describe("labels", () => {
  it("tem labels para todos os status de lab order", () => {
    expect(Object.keys(LAB_ORDER_STATUS_LABELS)).toHaveLength(6);
  });
});
