import { describe, it, expect } from "vitest";
import {
  isCancellableOsStatus,
  isRefundableOsStatus,
} from "@/lib/validators/service-order";

// Regressão: OS paga (PAID/READY_FOR_PICKUP/DELIVERED) NÃO pode ser cancelada
// (cancelamento não reverte o dinheiro) — deve ir por estorno (refund). Antes,
// cancel deixava PAID/READY_FOR_PICKUP passarem e o pagamento ficava registrado.

describe("isCancellableOsStatus", () => {
  it("permite cancelar antes do pagamento/conclusão", () => {
    for (const s of [
      "OPEN",
      "IN_DIAGNOSIS",
      "WAITING_APPROVAL",
      "APPROVED",
      "WAITING_PARTS",
      "IN_PROGRESS",
    ]) {
      expect(isCancellableOsStatus(s)).toBe(true);
    }
  });

  it("bloqueia cancelar OS concluída, paga ou finalizada", () => {
    for (const s of [
      "COMPLETED",
      "PAID",
      "READY_FOR_PICKUP",
      "DELIVERED",
      "REFUNDED",
      "CANCELLED",
    ]) {
      expect(isCancellableOsStatus(s)).toBe(false);
    }
  });
});

describe("isRefundableOsStatus", () => {
  it("permite estornar apenas OS pagas", () => {
    for (const s of ["PAID", "READY_FOR_PICKUP", "DELIVERED"]) {
      expect(isRefundableOsStatus(s)).toBe(true);
    }
  });

  it("não estorna OS não paga / em andamento", () => {
    for (const s of [
      "OPEN",
      "IN_DIAGNOSIS",
      "WAITING_APPROVAL",
      "APPROVED",
      "WAITING_PARTS",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "REFUNDED",
    ]) {
      expect(isRefundableOsStatus(s)).toBe(false);
    }
  });
});

describe("cancel × refund são caminhos disjuntos e completos para desfazer", () => {
  it("nenhum estado é cancelável E estornável ao mesmo tempo", () => {
    const all = [
      "OPEN", "IN_DIAGNOSIS", "WAITING_APPROVAL", "APPROVED", "WAITING_PARTS",
      "IN_PROGRESS", "COMPLETED", "PAID", "READY_FOR_PICKUP", "DELIVERED",
      "IN_WARRANTY", "CANCELLED", "REFUNDED",
    ];
    for (const s of all) {
      expect(isCancellableOsStatus(s) && isRefundableOsStatus(s)).toBe(false);
    }
  });
});
