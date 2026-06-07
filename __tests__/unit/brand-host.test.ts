import { describe, expect, it } from "vitest";
import { isLandingHost, isPublicCatalogHost, normalizeHost } from "@/lib/brand-host";

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
});
