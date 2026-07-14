import { describe, it, expect } from "vitest";
import { formatBrDate } from "@/lib/utils/format-br-date";

describe("formatBrDate", () => {
  it("formata YYYY-MM-DD por partes, sem recuar um dia (bug de fuso)", () => {
    // Regressao: `new Date("2026-07-01").toLocaleDateString("pt-BR")` em BRT
    // mostrava 30/06/2026. Por partes tem que dar 01/07/2026.
    expect(formatBrDate("2026-07-01")).toBe("01/07/2026");
    expect(formatBrDate("2026-07-13")).toBe("13/07/2026");
    expect(formatBrDate("2026-01-01")).toBe("01/01/2026");
    expect(formatBrDate("2026-12-31")).toBe("31/12/2026");
  });

  it("retorna — para nulo/indefinido/vazio", () => {
    expect(formatBrDate(null)).toBe("—");
    expect(formatBrDate(undefined)).toBe("—");
    expect(formatBrDate("")).toBe("—");
  });

  it("formata objeto Date pelo locale", () => {
    // Meio-dia UTC evita ambiguidade de fuso ao redor da meia-noite.
    const d = new Date("2026-07-13T12:00:00.000Z");
    expect(formatBrDate(d)).toBe("13/07/2026");
  });
});
