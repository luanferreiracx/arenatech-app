/**
 * classifyDepositStatus + predicados: a FONTE ÚNICA da semântica dos status de
 * depósito da Eulen. Trava o mapeamento (incl. o `delayed` do delay 24h) num só
 * lugar — os handlers/polling derivam daqui.
 */
import { describe, it, expect } from "vitest";
import {
  classifyDepositStatus,
  isPixReceivedStatus,
  isDepixSentStatus,
  isExpiredStatus,
  isRefundedStatus,
  isFailedStatus,
  isDepositNotPaidTerminal,
} from "@/lib/depix/deposit-status";

describe("classifyDepositStatus", () => {
  it.each([
    ["approved", "pix_received"],
    ["delayed", "pix_received"], // delay 24h: PIX ja caiu
    ["depix_sent", "depix_sent"],
    ["expired", "expired"],
    ["refunded", "refunded"],
    ["will_refund", "refunded"],
    ["canceled", "failed"],
    ["cancelled", "failed"],
    ["error", "failed"],
    ["pending", "pending"],
    ["under_review", "pending"],
  ] as const)("%s -> %s", (raw, expected) => {
    expect(classifyDepositStatus(raw)).toBe(expected);
  });

  it("case-insensitive", () => {
    expect(classifyDepositStatus("DELAYED")).toBe("pix_received");
  });

  it("desconhecido / vazio / null -> pending (seguro)", () => {
    expect(classifyDepositStatus("banana")).toBe("pending");
    expect(classifyDepositStatus("")).toBe("pending");
    expect(classifyDepositStatus(null)).toBe("pending");
  });
});

describe("predicados", () => {
  it("isPixReceivedStatus cobre approved E delayed (nao under_review)", () => {
    expect(isPixReceivedStatus("approved")).toBe(true);
    expect(isPixReceivedStatus("delayed")).toBe(true);
    expect(isPixReceivedStatus("under_review")).toBe(false);
    expect(isPixReceivedStatus("depix_sent")).toBe(false);
  });

  it("isDepixSentStatus so depix_sent", () => {
    expect(isDepixSentStatus("depix_sent")).toBe(true);
    expect(isDepixSentStatus("delayed")).toBe(false);
  });

  it("isExpired / isRefunded / isFailed", () => {
    expect(isExpiredStatus("expired")).toBe(true);
    expect(isRefundedStatus("refunded")).toBe(true);
    expect(isRefundedStatus("will_refund")).toBe(true);
    expect(isFailedStatus("canceled")).toBe(true);
    expect(isFailedStatus("error")).toBe(true);
    expect(isFailedStatus("refunded")).toBe(false); // refunded != failed
  });

  it("isDepositNotPaidTerminal = expired | failed | refunded (nao pix_received/pending)", () => {
    for (const s of ["expired", "canceled", "error", "refunded", "will_refund"]) {
      expect(isDepositNotPaidTerminal(s)).toBe(true);
    }
    for (const s of ["approved", "delayed", "depix_sent", "pending", "under_review"]) {
      expect(isDepositNotPaidTerminal(s)).toBe(false);
    }
  });
});
