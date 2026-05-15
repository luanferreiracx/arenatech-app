import { describe, it, expect } from "vitest";
import {
  createServiceObservationSchema,
  updateServiceObservationSchema,
  listServiceObservationsSchema,
} from "@/lib/validators/catalog";

const validUuid = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

describe("service observation validators", () => {
  describe("createServiceObservationSchema", () => {
    it("accepts valid input", () => {
      const result = createServiceObservationSchema.parse({
        title: "Troca de tela",
        observation: "Verificar se pelicula esta incluida",
      });
      expect(result.title).toBe("Troca de tela");
    });

    it("accepts with service types and device models", () => {
      const result = createServiceObservationSchema.parse({
        title: "Aviso bateria",
        observation: "Informar sobre garantia limitada",
        serviceTypes: ["Troca de bateria", "Bateria iPhone"],
        deviceModels: ["iPhone 15", "iPhone 14"],
      });
      expect(result.serviceTypes).toHaveLength(2);
      expect(result.deviceModels).toHaveLength(2);
    });

    it("accepts null service types", () => {
      const result = createServiceObservationSchema.parse({
        title: "Geral",
        observation: "Observacao geral",
        serviceTypes: null,
        deviceModels: null,
      });
      expect(result.serviceTypes).toBeNull();
    });

    it("rejects empty title", () => {
      expect(() =>
        createServiceObservationSchema.parse({
          title: "",
          observation: "text",
        }),
      ).toThrow();
    });

    it("rejects empty observation", () => {
      expect(() =>
        createServiceObservationSchema.parse({
          title: "Title",
          observation: "",
        }),
      ).toThrow();
    });

    it("rejects title over 100 chars", () => {
      expect(() =>
        createServiceObservationSchema.parse({
          title: "A".repeat(101),
          observation: "text",
        }),
      ).toThrow();
    });
  });

  describe("updateServiceObservationSchema", () => {
    it("accepts valid update", () => {
      const result = updateServiceObservationSchema.parse({
        id: validUuid,
        title: "Updated title",
        observation: "Updated text",
        serviceTypes: ["Troca de tela"],
      });
      expect(result.id).toBe(validUuid);
    });

    it("rejects missing id", () => {
      expect(() =>
        updateServiceObservationSchema.parse({
          title: "Title",
          observation: "text",
        }),
      ).toThrow();
    });
  });

  describe("listServiceObservationsSchema", () => {
    it("accepts empty input", () => {
      const result = listServiceObservationsSchema.parse({});
      expect(result).toBeDefined();
    });

    it("accepts active filter", () => {
      const result = listServiceObservationsSchema.parse({ active: true });
      expect(result.active).toBe(true);
    });

    it("accepts service type filter", () => {
      const result = listServiceObservationsSchema.parse({
        serviceType: "Troca de tela",
        deviceModel: "iPhone 15",
      });
      expect(result.serviceType).toBe("Troca de tela");
    });
  });
});
