import { describe, it, expect } from "vitest";
import { isLabEligibleStatus } from "@/lib/validators/service-order";

// Laboratório externo só durante o serviço (antes do pagamento/entrega).
// Regressão: antes não havia guarda — dava pra enviar ao lab uma OS paga,
// entregue, cancelada ou estornada.

describe("isLabEligibleStatus", () => {
  it("permite operações de lab durante o serviço", () => {
    for (const s of [
      "OPEN",
      "IN_DIAGNOSIS",
      "WAITING_APPROVAL",
      "APPROVED",
      "WAITING_PARTS",
      "IN_PROGRESS",
      "COMPLETED",
      "IN_WARRANTY",
    ]) {
      expect(isLabEligibleStatus(s)).toBe(true);
    }
  });

  it("bloqueia lab em OS paga, entregue, cancelada ou estornada", () => {
    for (const s of ["PAID", "READY_FOR_PICKUP", "DELIVERED", "CANCELLED", "REFUNDED"]) {
      expect(isLabEligibleStatus(s)).toBe(false);
    }
  });
});
