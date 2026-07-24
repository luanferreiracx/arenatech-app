/**
 * D4 — rótulos do breadcrumb: mapa completo + UUID não vira crumb cru.
 */
import { describe, it, expect } from "vitest";
import { getLabel } from "@/components/layout/breadcrumb";

describe("breadcrumb getLabel", () => {
  it("mapeia segmentos conhecidos que antes caíam no fallback", () => {
    expect(getLabel("quick-sales")).toBe("Vendas Avulsas");
    expect(getLabel("valuations")).toBe("Avaliações");
    expect(getLabel("interests")).toBe("Interesses");
    expect(getLabel("my-commission")).toBe("Minha Comissão");
  });

  it("UUID vira 'Detalhe' (não expõe o id cru na rota)", () => {
    expect(getLabel("2f1c8e4a-1234-4abc-8def-1234567890ab")).toBe("Detalhe");
  });

  it("segmento desconhecido: capitaliza a primeira letra (fallback)", () => {
    expect(getLabel("foobar")).toBe("Foobar");
  });
});
