/**
 * maySettleSaleEffect: trava quais status de transação DePix permitem liberar o
 * efeito de VENDA (PDV/QuickSale). Guard contra a corrida em que um webhook MED
 * (devolução do Banco Central) muda o status da tx entre a revalidação e o
 * applyPixReceivedEffects — sem este guard, a venda seria liberada mesmo com o
 * depósito já revertido (auditoria WH-3).
 */
import { describe, it, expect } from "vitest";
import { maySettleSaleEffect } from "@/lib/depix/tx-status";

describe("maySettleSaleEffect", () => {
  it("permite quando o PIX foi recebido e não foi revertido", () => {
    for (const s of ["PROCESSING", "PROCESSING_FEE", "COMPLETED", "COMPLETED_FEE_PENDING"] as const) {
      expect(maySettleSaleEffect(s)).toBe(true);
    }
  });

  it("BLOQUEIA quando o depósito foi revertido/terminal (o caso MED da WH-3)", () => {
    for (const s of ["MED_REFUNDED", "EXPIRED", "CANCELLED", "FAILED"] as const) {
      expect(maySettleSaleEffect(s)).toBe(false);
    }
  });

  it("BLOQUEIA estados que não são de depósito-pago (PENDING / estados de saque)", () => {
    for (const s of ["PENDING", "AWAITING_DEPOSIT", "HELD"] as const) {
      expect(maySettleSaleEffect(s)).toBe(false);
    }
  });

  it("fail-safe: status desconhecido → não libera", () => {
    expect(maySettleSaleEffect("SOMETHING_NEW")).toBe(false);
  });
});
