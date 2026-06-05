import { describe, it, expect } from "vitest";
import {
  createPlanSchema,
  updatePlanSchema,
  submitPreRegistrationSchema,
  approvePreRegistrationSchema,
  rejectPreRegistrationSchema,
  listPreRegistrationsSchema,
  listTenantsSchema,
  updateTenantSchema,
  planStatusEnum,
  PLAN_STATUS_LABELS,
  PRE_REGISTRATION_STATUS_LABELS,
} from "@/lib/validators/admin";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("planStatusEnum", () => {
  it("aceita status validos", () => {
    expect(planStatusEnum.safeParse("ACTIVE").success).toBe(true);
    expect(planStatusEnum.safeParse("INACTIVE").success).toBe(true);
  });
});

describe("createPlanSchema", () => {
  const valid = {
    name: "Basico",
    slug: "basico",
    monthlyPrice: 9900,
    maxUsers: 5,
    maxImeiQueries: 50,
  };

  it("aceita input valido", () => {
    expect(createPlanSchema.safeParse(valid).success).toBe(true);
  });
  it("aceita com preco anual", () => {
    expect(createPlanSchema.safeParse({ ...valid, yearlyPrice: 99900 }).success).toBe(true);
  });
  it("rejeita nome vazio", () => {
    expect(createPlanSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });
  it("rejeita slug invalido", () => {
    expect(createPlanSchema.safeParse({ ...valid, slug: "Invalido Slug" }).success).toBe(false);
  });
  it("rejeita maxUsers zero", () => {
    expect(createPlanSchema.safeParse({ ...valid, maxUsers: 0 }).success).toBe(false);
  });
});

describe("updatePlanSchema", () => {
  it("aceita update valido", () => {
    expect(updatePlanSchema.safeParse({
      id: UUID,
      name: "Pro",
      monthlyPrice: 19900,
      maxUsers: 10,
      maxImeiQueries: 100,
      status: "ACTIVE",
    }).success).toBe(true);
  });
});

describe("submitPreRegistrationSchema", () => {
  // CPF + CNPJ com DV valido (necessario apos endurecer validacao com isValidCpf/isValidCnpj)
  const valid = {
    tradeName: "Loja Teste",
    ownerName: "Joao Silva",
    ownerCpf: "11144477735", // CPF com DV valido
    ownerEmail: "joao@test.com",
    ownerPhone: "86999999999",
  };

  it("aceita input valido", () => {
    expect(submitPreRegistrationSchema.safeParse(valid).success).toBe(true);
  });
  it("aceita com CNPJ e plano", () => {
    // CNPJ com DV valido
    expect(submitPreRegistrationSchema.safeParse({ ...valid, cnpj: "11222333000181", planId: UUID }).success).toBe(true);
  });
  it("rejeita sem nome fantasia", () => {
    expect(submitPreRegistrationSchema.safeParse({ ...valid, tradeName: "" }).success).toBe(false);
  });
  it("rejeita email invalido", () => {
    expect(submitPreRegistrationSchema.safeParse({ ...valid, ownerEmail: "invalid" }).success).toBe(false);
  });
  it("rejeita CPF curto", () => {
    expect(submitPreRegistrationSchema.safeParse({ ...valid, ownerCpf: "123" }).success).toBe(false);
  });
  it("rejeita CPF com DV invalido", () => {
    expect(submitPreRegistrationSchema.safeParse({ ...valid, ownerCpf: "12345678901" }).success).toBe(false);
  });
  it("rejeita CNPJ com DV invalido", () => {
    expect(submitPreRegistrationSchema.safeParse({ ...valid, cnpj: "12345678000199" }).success).toBe(false);
  });
  it("rejeita telefone curto", () => {
    expect(submitPreRegistrationSchema.safeParse({ ...valid, ownerPhone: "123" }).success).toBe(false);
  });
});

describe("approvePreRegistrationSchema", () => {
  it("aceita com ID", () => {
    expect(approvePreRegistrationSchema.safeParse({ id: UUID }).success).toBe(true);
  });
  it("aceita com planId", () => {
    expect(approvePreRegistrationSchema.safeParse({ id: UUID, planId: UUID }).success).toBe(true);
  });
});

describe("rejectPreRegistrationSchema", () => {
  it("aceita com motivo", () => {
    expect(rejectPreRegistrationSchema.safeParse({ id: UUID, reason: "Dados incorretos" }).success).toBe(true);
  });
  it("rejeita sem motivo", () => {
    expect(rejectPreRegistrationSchema.safeParse({ id: UUID, reason: "" }).success).toBe(false);
  });
});

describe("listPreRegistrationsSchema", () => {
  it("aceita filtros vazios", () => {
    expect(listPreRegistrationsSchema.safeParse({}).success).toBe(true);
  });
  it("aceita com status e busca", () => {
    expect(listPreRegistrationsSchema.safeParse({ status: "PENDING", search: "test" }).success).toBe(true);
  });
});

describe("listTenantsSchema", () => {
  it("aceita filtros vazios", () => {
    expect(listTenantsSchema.safeParse({}).success).toBe(true);
  });
  it("aceita com status", () => {
    expect(listTenantsSchema.safeParse({ status: "ACTIVE" }).success).toBe(true);
  });
});

describe("updateTenantSchema", () => {
  it("aceita update valido", () => {
    expect(updateTenantSchema.safeParse({ id: UUID, name: "Loja Updated", status: "SUSPENDED" }).success).toBe(true);
  });

  it("aceita plano como UUID ou sem plano", () => {
    expect(updateTenantSchema.safeParse({ id: UUID, name: "Loja", status: "ACTIVE", plan: UUID }).success).toBe(true);
    expect(updateTenantSchema.safeParse({ id: UUID, name: "Loja", status: "ACTIVE", plan: null }).success).toBe(true);
  });

  it("aceita plano legado para preservacao na edicao", () => {
    expect(updateTenantSchema.safeParse({ id: UUID, name: "Loja", status: "ACTIVE", plan: "basico" }).success).toBe(true);
  });

  it("rejeita plano vazio", () => {
    expect(updateTenantSchema.safeParse({ id: UUID, name: "Loja", status: "ACTIVE", plan: "" }).success).toBe(false);
  });
});

describe("labels", () => {
  it("tem labels para plan status", () => {
    expect(Object.keys(PLAN_STATUS_LABELS)).toHaveLength(2);
  });
  it("tem labels para pre-registration status", () => {
    expect(Object.keys(PRE_REGISTRATION_STATUS_LABELS)).toHaveLength(3);
  });
});
