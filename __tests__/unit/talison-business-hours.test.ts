import { describe, it, expect } from "vitest";
import { buildNowNote, isStoreOpen, businessHoursLabel } from "@/lib/talison/business-hours";

// America/Fortaleza = UTC-3 fixo (Teresina/PI), sem horário de verão.
describe("buildNowNote — consciência de horário", () => {
  it("sábado à tarde está ABERTA (padrão seg–sáb 09h30–20h)", () => {
    // 2026-06-13 é sábado; 17:00Z = 14:00 em Fortaleza.
    const note = buildNowNote({}, new Date("2026-06-13T17:00:00Z"));
    expect(note).toContain("sábado");
    expect(note).toContain("ABERTA");
    expect(note).toContain("14:00");
  });

  it("domingo está FECHADA", () => {
    const note = buildNowNote({}, new Date("2026-06-14T17:00:00Z"));
    expect(note).toContain("domingo");
    expect(note).toContain("FECHADA");
  });

  it("dia útil antes das 09h30 está FECHADA", () => {
    // 2026-06-10 é quarta; 11:00Z = 08:00 em Fortaleza.
    const note = buildNowNote({}, new Date("2026-06-10T11:00:00Z"));
    expect(note).toContain("FECHADA");
  });

  it("dia útil após o fechamento está FECHADA", () => {
    // 23:30Z = 20:30 em Fortaleza, após as 20h.
    const note = buildNowNote({}, new Date("2026-06-10T23:30:00Z"));
    expect(note).toContain("FECHADA");
  });

  it("respeita horário configurado pelo tenant", () => {
    // Config 08:00–22:00; 11:00Z = 08:00 Fortaleza → deve estar ABERTA.
    const note = buildNowNote({ start: "08:00", end: "22:00" }, new Date("2026-06-10T11:00:00Z"));
    expect(note).toContain("ABERTA");
  });
});

describe("isStoreOpen", () => {
  it("aberta em dia útil dentro do horário", () => {
    expect(isStoreOpen({}, new Date("2026-06-13T17:00:00Z"))).toBe(true); // sáb 14:00
  });
  it("fechada no domingo", () => {
    expect(isStoreOpen({}, new Date("2026-06-14T17:00:00Z"))).toBe(false);
  });
  it("fechada após as 20h", () => {
    expect(isStoreOpen({}, new Date("2026-06-10T23:30:00Z"))).toBe(false); // 20:30 Fortaleza
  });
  it("fechada antes das 09h30", () => {
    expect(isStoreOpen({}, new Date("2026-06-10T11:00:00Z"))).toBe(false); // 08:00 Fortaleza
  });
});

describe("businessHoursLabel", () => {
  it("usa o padrão seg–sáb 09h30–20h", () => {
    expect(businessHoursLabel({})).toBe("segunda a sábado, das 09h30–20h");
  });
});
