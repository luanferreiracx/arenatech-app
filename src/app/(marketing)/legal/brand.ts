import { headers } from "next/headers";
import { normalizeHost } from "@/lib/brand-host";

const PDVCRIPTO_HOSTS = new Set(["pdvcripto.app", "www.pdvcripto.app"]);

export type LegalBrand = {
  name: string;
  domain: string;
  legalEntity: string;
  contactEmail: string;
};

/**
 * Marca dos documentos legais conforme o host da requisição. pdvcripto.app e
 * pdvdepix.app compartilham a mesma plataforma (Arena Tech) — só o nome público
 * e o domínio mudam. Os documentos referenciam a pessoa jurídica operadora.
 */
export async function resolveLegalBrand(): Promise<LegalBrand> {
  const headerStore = await headers();
  const host = normalizeHost(headerStore.get("x-forwarded-host") ?? headerStore.get("host"));
  const isCripto = PDVCRIPTO_HOSTS.has(host);
  return {
    name: isCripto ? "pdvcripto" : "pdvdepix",
    domain: isCripto ? "pdvcripto.app" : "pdvdepix.app",
    // Pessoa jurídica operadora — AJUSTAR com a razão social/CNPJ reais antes de publicar.
    legalEntity: "Arena Tech (razão social e CNPJ a confirmar)",
    contactEmail: isCripto ? "contato@pdvcripto.app" : "contato@pdvdepix.app",
  };
}
