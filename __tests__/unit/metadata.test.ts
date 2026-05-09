import { describe, it, expect } from "vitest";
import { createMetadata } from "@/lib/metadata";

describe("createMetadata", () => {
  it("formats title with app name suffix", () => {
    const meta = createMetadata("Clientes");
    expect(meta.title).toBe("Clientes | Arena Tech");
  });

  it("uses default description when none provided", () => {
    const meta = createMetadata("PDV");
    expect(meta.description).toBe("Sistema de gest\u00e3o Arena Tech");
  });

  it("uses custom description when provided", () => {
    const meta = createMetadata("Clientes", "Gerencie seus clientes");
    expect(meta.description).toBe("Gerencie seus clientes");
  });

  it("handles empty title", () => {
    const meta = createMetadata("");
    expect(meta.title).toBe(" | Arena Tech");
  });
});
