import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchNcm, getNcmByCode } from "@/lib/integrations/brasilapi-ncm";

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("BrasilAPI NCM Service", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("searchNcm", () => {
    it("returns empty for terms < 3 chars", async () => {
      const result = await searchNcm("ab");
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns curated results for 'celular' without calling API", async () => {
      const result = await searchNcm("celular");
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.code).toBe("85171200");
      expect(result[0]!.description).toContain("celular");
    });

    it("returns curated results for 'capa'", async () => {
      const result = await searchNcm("capa");
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.code).toBe("42029200");
    });

    it("returns curated results for 'bateria'", async () => {
      const result = await searchNcm("bateria");
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.code).toBe("85076000");
    });

    it("calls BrasilAPI when curated results are few", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { codigo: "99999999", descricao: "Produto especial XYZ" },
        ],
      });

      const result = await searchNcm("produto_especial_xyz");
      expect(mockFetch).toHaveBeenCalled();
      expect(result.some((r) => r.code === "99999999")).toBe(true);
    });

    it("handles BrasilAPI failure gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await searchNcm("coisa_rara_impossivel");
      // Should not throw, returns whatever local results found
      expect(Array.isArray(result)).toBe(true);
    });

    it("handles BrasilAPI timeout gracefully", async () => {
      mockFetch.mockImplementationOnce(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error("Aborted")), 100))
      );
      const result = await searchNcm("timeout_test");
      expect(Array.isArray(result)).toBe(true);
    });

    it("limits results to 20", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          Array.from({ length: 50 }, (_, i) => ({
            codigo: String(10000000 + i),
            descricao: `Item ${i}`,
          })),
      });

      const result = await searchNcm("muitos_resultados_xyz");
      expect(result.length).toBeLessThanOrEqual(20);
    });
  });

  describe("getNcmByCode", () => {
    it("returns curated result for known code", async () => {
      const result = await getNcmByCode("85171200");
      expect(result).not.toBeNull();
      expect(result!.code).toBe("85171200");
    });

    it("calls API for unknown code", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ codigo: "12345678", descricao: "Item desconhecido" }),
      });

      const result = await getNcmByCode("12345678");
      expect(mockFetch).toHaveBeenCalled();
      expect(result).toEqual({ code: "12345678", description: "Item desconhecido" });
    });

    it("returns null for API 404", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const result = await getNcmByCode("00000000");
      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await getNcmByCode("99999999");
      expect(result).toBeNull();
    });
  });
});
