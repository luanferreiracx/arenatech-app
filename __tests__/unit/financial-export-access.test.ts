import { describe, it, expect } from "vitest";
import { resolveExportTxType } from "@/lib/financial/export-access";

describe("resolveExportTxType (G-P0-3 — RBAC do export financeiro)", () => {
  it("operador nunca recebe PAYABLE, mesmo pedindo explicitamente", () => {
    expect(resolveExportTxType(false, "PAYABLE")).toBe("RECEIVABLE");
    expect(resolveExportTxType(false, "RECEIVABLE")).toBe("RECEIVABLE");
    expect(resolveExportTxType(false, null)).toBe("RECEIVABLE");
    expect(resolveExportTxType(false, undefined)).toBe("RECEIVABLE");
    expect(resolveExportTxType(false, "lixo")).toBe("RECEIVABLE");
  });

  it("admin recebe o tipo pedido quando válido", () => {
    expect(resolveExportTxType(true, "PAYABLE")).toBe("PAYABLE");
    expect(resolveExportTxType(true, "RECEIVABLE")).toBe("RECEIVABLE");
  });

  it("admin sem txType (ou inválido) recebe null = ambos os tipos", () => {
    expect(resolveExportTxType(true, null)).toBeNull();
    expect(resolveExportTxType(true, undefined)).toBeNull();
    expect(resolveExportTxType(true, "lixo")).toBeNull();
  });
});
