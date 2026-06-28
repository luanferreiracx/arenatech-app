import { describe, expect, it } from "vitest";
import { isKnownHost, isLandingHost, isPublicCatalogHost, normalizeHost } from "@/lib/brand-host";

describe("brand host resolution", () => {
  it("normalizes host headers from direct requests and proxies", () => {
    expect(normalizeHost("PDVDEPIX.app:3000")).toBe("pdvdepix.app");
    expect(normalizeHost("www.pdvdepix.app, app.arenatechpi.com.br")).toBe("www.pdvdepix.app");
    expect(normalizeHost(null)).toBe("");
  });

  it("recognizes pdvdepix landing domains and compatibility aliases", () => {
    expect(isLandingHost("pdvdepix.app")).toBe(true);
    expect(isLandingHost("www.pdvdepix.app")).toBe(true);
    expect(isLandingHost("depixpdv.app")).toBe(true);
    expect(isLandingHost("www.depixpdv.app")).toBe(true);
    expect(isLandingHost("app.arenatechpi.com.br")).toBe(false);
  });

  it("recognizes the public catalog domain", () => {
    expect(isPublicCatalogHost("catalogo.arenatechpi.com.br")).toBe(true);
    expect(isPublicCatalogHost("catalogo.arenatechpi.com.br:3000")).toBe(true);
    expect(isPublicCatalogHost("app.arenatechpi.com.br")).toBe(false);
    expect(isPublicCatalogHost("pdvdepix.app")).toBe(false);
  });

  describe("isKnownHost (allowlist anti-open-redirect — P2-3)", () => {
    it("aceita hosts conhecidos da app (com porta e case-insensitive)", () => {
      expect(isKnownHost("pdvdepix.app")).toBe(true);
      expect(isKnownHost("PDVDEPIX.app:443")).toBe(true);
      expect(isKnownHost("app.arenatechpi.com.br")).toBe(true);
      expect(isKnownHost("catalogo.arenatechpi.com.br")).toBe(true);
      expect(isKnownHost("localhost:3000")).toBe(true);
    });

    it("rejeita hosts forjados / desconhecidos (alvo de phishing)", () => {
      expect(isKnownHost("atacante.com")).toBe(false);
      expect(isKnownHost("pdvdepix.app.atacante.com")).toBe(false);
      expect(isKnownHost("evil.io")).toBe(false);
      expect(isKnownHost(null)).toBe(false);
      expect(isKnownHost("")).toBe(false);
    });
  });
});
