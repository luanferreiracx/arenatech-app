import { describe, it, expect } from "vitest";
import {
  methodShowsChange,
  methodShowsInstallments,
} from "@/app/(app)/pdv/_components/payment-method-display";

describe("payment-method-display", () => {
  describe("methodShowsInstallments", () => {
    it("mostra parcelas para forma que aceita parcelamento, mesmo com key = UUID (code null)", () => {
      // Regressao: forma cadastrada pela UI nao grava `code`, entao a key vira o
      // UUID. Antes o form comparava a key com "cartao_credito" e escondia as
      // parcelas. Agora deriva de acceptsInstallments.
      const creditCardFromDb = {
        key: "9f1b6c2a-0000-4000-8000-000000000000",
        type: "CREDIT_CARD",
        acceptsInstallments: true,
      };
      expect(methodShowsInstallments(creditCardFromDb)).toBe(true);
    });

    it("nao mostra parcelas para debito/pix/dinheiro", () => {
      expect(methodShowsInstallments({ acceptsInstallments: false })).toBe(false);
    });

    it("retorna false quando nenhuma forma esta selecionada", () => {
      expect(methodShowsInstallments(undefined)).toBe(false);
    });
  });

  describe("methodShowsChange", () => {
    it("mostra troco para forma tipo CASH, independente do code/key", () => {
      // Regressao: dinheiro cadastrado pela UI tem type CASH mas code null.
      expect(methodShowsChange("CASH")).toBe(true);
    });

    it("nao mostra troco para cartao/pix", () => {
      expect(methodShowsChange("CREDIT_CARD")).toBe(false);
      expect(methodShowsChange("PIX")).toBe(false);
      expect(methodShowsChange(undefined)).toBe(false);
    });
  });
});
