import { describe, it, expect } from "vitest";
import { getCatalogSubdomainSlug } from "@/lib/brand-host";

/**
 * Extração do slug do tenant a partir do subdomínio do catálogo
 * (`<slug>.pdvdepix.app`). Multi-tenant por subdomínio (PR catálogo).
 */
describe("getCatalogSubdomainSlug", () => {
  it("extrai o slug de <slug>.pdvdepix.app", () => {
    expect(getCatalogSubdomainSlug("arena-tech.pdvdepix.app")).toBe("arena-tech");
    expect(getCatalogSubdomainSlug("minha-loja.pdvdepix.app")).toBe("minha-loja");
  });

  it("aceita os domínios-base irmãos (depixpdv/pdvcripto)", () => {
    expect(getCatalogSubdomainSlug("loja1.depixpdv.app")).toBe("loja1");
    expect(getCatalogSubdomainSlug("loja1.pdvcripto.app")).toBe("loja1");
  });

  it("ignora porta e caixa alta no host", () => {
    expect(getCatalogSubdomainSlug("Arena-Tech.PDVDEPIX.app:443")).toBe("arena-tech");
  });

  it("retorna null para a raiz e subdomínios reservados", () => {
    expect(getCatalogSubdomainSlug("pdvdepix.app")).toBeNull();
    expect(getCatalogSubdomainSlug("www.pdvdepix.app")).toBeNull();
    expect(getCatalogSubdomainSlug("app.pdvdepix.app")).toBeNull();
    expect(getCatalogSubdomainSlug("api.pdvdepix.app")).toBeNull();
  });

  it("retorna null para host de outro domínio ou multi-nível", () => {
    expect(getCatalogSubdomainSlug("catalogo.arenatechpi.com.br")).toBeNull();
    expect(getCatalogSubdomainSlug("a.b.pdvdepix.app")).toBeNull(); // 2 níveis
    expect(getCatalogSubdomainSlug("evil.com")).toBeNull();
    expect(getCatalogSubdomainSlug("")).toBeNull();
    expect(getCatalogSubdomainSlug(null)).toBeNull();
  });

  it("rejeita slug com caracteres inválidos (anti-injeção)", () => {
    expect(getCatalogSubdomainSlug("a_b.pdvdepix.app")).toBeNull(); // underscore
    expect(getCatalogSubdomainSlug("-loja.pdvdepix.app")).toBeNull(); // começa com hífen
    expect(getCatalogSubdomainSlug("loja'.pdvdepix.app")).toBeNull();
  });
});
