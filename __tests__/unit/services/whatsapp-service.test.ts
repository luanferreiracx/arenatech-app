import { describe, it, expect } from "vitest";
import { formatPhone } from "@/lib/services/whatsapp-service";

describe("whatsapp-service", () => {
  describe("formatPhone", () => {
    it("formats 11-digit number with country code", () => {
      expect(formatPhone("86999887766")).toBe("5586999887766");
    });

    it("formats 10-digit number (landline) with country code", () => {
      expect(formatPhone("8632217788")).toBe("558632217788");
    });

    it("keeps number already with 55 prefix", () => {
      expect(formatPhone("5586999887766")).toBe("5586999887766");
    });

    it("strips non-digit characters", () => {
      expect(formatPhone("(86) 99988-7766")).toBe("5586999887766");
    });

    it("handles +55 prefix", () => {
      expect(formatPhone("+5586999887766")).toBe("5586999887766");
    });

    it("handles short number gracefully", () => {
      const result = formatPhone("12345");
      expect(result).toBe("12345");
    });
  });
});
