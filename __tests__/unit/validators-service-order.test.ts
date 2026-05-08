import { describe, it, expect } from "vitest";
import {
  createServiceOrderSchema,
  updateStatusSchema,
  checklistSchema,
  deviceInfoSchema,
  listServiceOrdersSchema,
  addItemSchema,
  registerPaymentSchema,
  ALLOWED_TRANSITIONS,
  type ServiceOrderStatusValue,
} from "@/lib/validators/service-order";

// ────────────────────────────────────────────────────────────────────────────
// createServiceOrderSchema
// ────────────────────────────────────────────────────────────────────────────

describe("createServiceOrderSchema", () => {
  const validInput = {
    customerId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    reportedProblem: "Tela trincada",
    items: [],
  };

  it("accepts valid minimum input", () => {
    const result = createServiceOrderSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects missing customerId", () => {
    const result = createServiceOrderSchema.safeParse({
      ...validInput,
      customerId: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid customerId (not UUID)", () => {
    const result = createServiceOrderSchema.safeParse({
      ...validInput,
      customerId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty reportedProblem", () => {
    const result = createServiceOrderSchema.safeParse({
      ...validInput,
      reportedProblem: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing reportedProblem", () => {
    const result = createServiceOrderSchema.safeParse({
      customerId: validInput.customerId,
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts full input with items", () => {
    const result = createServiceOrderSchema.safeParse({
      ...validInput,
      deviceType: "Celular",
      deviceBrand: "Apple",
      deviceModel: "iPhone 15",
      items: [
        {
          type: "SERVICE",
          description: "Troca de tela",
          quantity: 1,
          unitPrice: 35000,
        },
      ],
      discount: 5000,
      technicianId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    });
    expect(result.success).toBe(true);
  });

  it("rejects item with empty description", () => {
    const result = createServiceOrderSchema.safeParse({
      ...validInput,
      items: [
        {
          type: "SERVICE",
          description: "",
          quantity: 1,
          unitPrice: 100,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects item with negative quantity", () => {
    const result = createServiceOrderSchema.safeParse({
      ...validInput,
      items: [
        {
          type: "PRODUCT",
          description: "Película",
          quantity: -1,
          unitPrice: 100,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects item with negative unitPrice", () => {
    const result = createServiceOrderSchema.safeParse({
      ...validInput,
      items: [
        {
          type: "SERVICE",
          description: "Diagnóstico",
          quantity: 1,
          unitPrice: -50,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative discount", () => {
    const result = createServiceOrderSchema.safeParse({
      ...validInput,
      discount: -100,
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// updateStatusSchema
// ────────────────────────────────────────────────────────────────────────────

describe("updateStatusSchema", () => {
  it("accepts valid transition", () => {
    const result = updateStatusSchema.safeParse({
      orderId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      status: "IN_DIAGNOSIS",
    });
    expect(result.success).toBe(true);
  });

  it("accepts with optional notes", () => {
    const result = updateStatusSchema.safeParse({
      orderId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      status: "CANCELLED",
      cancellationReason: "Cliente desistiu",
      notes: "Contactado por telefone",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = updateStatusSchema.safeParse({
      orderId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      status: "INVALID_STATUS",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing orderId", () => {
    const result = updateStatusSchema.safeParse({
      status: "OPEN",
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ALLOWED_TRANSITIONS
// ────────────────────────────────────────────────────────────────────────────

describe("ALLOWED_TRANSITIONS", () => {
  it("OPEN can go to IN_DIAGNOSIS and CANCELLED", () => {
    expect(ALLOWED_TRANSITIONS.OPEN).toContain("IN_DIAGNOSIS");
    expect(ALLOWED_TRANSITIONS.OPEN).toContain("CANCELLED");
    expect(ALLOWED_TRANSITIONS.OPEN).not.toContain("DELIVERED");
    expect(ALLOWED_TRANSITIONS.OPEN).not.toContain("PAID");
  });

  it("IN_DIAGNOSIS can go to WAITING_APPROVAL, APPROVED, or CANCELLED", () => {
    expect(ALLOWED_TRANSITIONS.IN_DIAGNOSIS).toContain("WAITING_APPROVAL");
    expect(ALLOWED_TRANSITIONS.IN_DIAGNOSIS).toContain("APPROVED");
    expect(ALLOWED_TRANSITIONS.IN_DIAGNOSIS).toContain("CANCELLED");
  });

  it("COMPLETED can only go to PAID or CANCELLED", () => {
    expect(ALLOWED_TRANSITIONS.COMPLETED).toContain("PAID");
    expect(ALLOWED_TRANSITIONS.COMPLETED).toContain("CANCELLED");
    expect(ALLOWED_TRANSITIONS.COMPLETED).toHaveLength(2);
  });

  it("CANCELLED is terminal", () => {
    expect(ALLOWED_TRANSITIONS.CANCELLED).toHaveLength(0);
  });

  it("REFUNDED is terminal", () => {
    expect(ALLOWED_TRANSITIONS.REFUNDED).toHaveLength(0);
  });

  it("DELIVERED can only go to IN_WARRANTY", () => {
    expect(ALLOWED_TRANSITIONS.DELIVERED).toContain("IN_WARRANTY");
    expect(ALLOWED_TRANSITIONS.DELIVERED).toHaveLength(1);
  });

  it("IN_WARRANTY can reopen as OPEN", () => {
    expect(ALLOWED_TRANSITIONS.IN_WARRANTY).toContain("OPEN");
    expect(ALLOWED_TRANSITIONS.IN_WARRANTY).toHaveLength(1);
  });

  it("PAID can go to READY_FOR_PICKUP, DELIVERED, or REFUNDED", () => {
    expect(ALLOWED_TRANSITIONS.PAID).toContain("READY_FOR_PICKUP");
    expect(ALLOWED_TRANSITIONS.PAID).toContain("DELIVERED");
    expect(ALLOWED_TRANSITIONS.PAID).toContain("REFUNDED");
    expect(ALLOWED_TRANSITIONS.PAID).toHaveLength(3);
  });

  it("no state can transition to itself", () => {
    for (const [status, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(targets).not.toContain(status);
    }
  });

  it("OPEN to DELIVERED is not allowed (skip states)", () => {
    expect(ALLOWED_TRANSITIONS.OPEN).not.toContain("DELIVERED");
  });

  it("IN_PROGRESS to PAID is not allowed (must be COMPLETED first)", () => {
    expect(ALLOWED_TRANSITIONS.IN_PROGRESS).not.toContain("PAID");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// checklistSchema
// ────────────────────────────────────────────────────────────────────────────

describe("checklistSchema", () => {
  it("accepts empty object", () => {
    const result = checklistSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial checklist", () => {
    const result = checklistSchema.safeParse({
      powerOn: true,
      screen: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.powerOn).toBe(true);
      expect(result.data.screen).toBe(false);
      expect(result.data.bluetooth).toBeUndefined();
    }
  });

  it("accepts full checklist", () => {
    const full = {
      powerOn: true,
      vibration: true,
      buttons: true,
      bluetooth: true,
      wifi: true,
      backGlass: false,
      audio: true,
      microphone: true,
      cameras: false,
      touchFaceId: true,
      charging: true,
      screen: true,
      cableCharging: true,
      wirelessCharging: false,
      magSafe: false,
    };
    const result = checklistSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it("rejects non-boolean values", () => {
    const result = checklistSchema.safeParse({
      powerOn: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("rejects number values", () => {
    const result = checklistSchema.safeParse({
      screen: 1,
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// deviceInfoSchema
// ────────────────────────────────────────────────────────────────────────────

describe("deviceInfoSchema", () => {
  it("accepts empty object", () => {
    const result = deviceInfoSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial device info", () => {
    const result = deviceInfoSchema.safeParse({
      waterDamage: true,
      dropDamage: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-boolean values", () => {
    const result = deviceInfoSchema.safeParse({
      waterDamage: "sim",
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// listServiceOrdersSchema
// ────────────────────────────────────────────────────────────────────────────

describe("listServiceOrdersSchema", () => {
  it("accepts minimum required fields", () => {
    const result = listServiceOrdersSchema.safeParse({
      page: 0,
      pageSize: 20,
    });
    expect(result.success).toBe(true);
  });

  it("accepts with all filters", () => {
    const result = listServiceOrdersSchema.safeParse({
      page: 0,
      pageSize: 50,
      search: "OS2026",
      status: "OPEN",
      technicianId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = listServiceOrdersSchema.safeParse({
      page: 0,
      pageSize: 20,
      status: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative page", () => {
    const result = listServiceOrdersSchema.safeParse({
      page: -1,
      pageSize: 20,
    });
    expect(result.success).toBe(false);
  });

  it("rejects pageSize over 100", () => {
    const result = listServiceOrdersSchema.safeParse({
      page: 0,
      pageSize: 101,
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// addItemSchema
// ────────────────────────────────────────────────────────────────────────────

describe("addItemSchema", () => {
  it("accepts valid service item", () => {
    const result = addItemSchema.safeParse({
      orderId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      type: "SERVICE",
      description: "Troca de tela",
      quantity: 1,
      unitPrice: 35000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid product item", () => {
    const result = addItemSchema.safeParse({
      orderId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      type: "PRODUCT",
      description: "Película de vidro",
      quantity: 2,
      unitPrice: 2500,
      costPrice: 1000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero quantity", () => {
    const result = addItemSchema.safeParse({
      orderId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      type: "SERVICE",
      description: "Diagnóstico",
      quantity: 0,
      unitPrice: 5000,
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// registerPaymentSchema
// ────────────────────────────────────────────────────────────────────────────

describe("registerPaymentSchema", () => {
  it("accepts valid payment", () => {
    const result = registerPaymentSchema.safeParse({
      orderId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      paymentMethod: "PIX",
      paidAmount: 35000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing payment method", () => {
    const result = registerPaymentSchema.safeParse({
      orderId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      paymentMethod: "",
      paidAmount: 35000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = registerPaymentSchema.safeParse({
      orderId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      paymentMethod: "Dinheiro",
      paidAmount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = registerPaymentSchema.safeParse({
      orderId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      paymentMethod: "Cartão",
      paidAmount: -100,
    });
    expect(result.success).toBe(false);
  });
});
