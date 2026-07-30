/**
 * Finalização — Módulo 10, CFG-6: gating por PAPEL nas abas de Configurações.
 *
 * O gating de aba era só por MÓDULO. Medido no navegador, na cópia de produção:
 * o operador abria as 15 abas do admin, com "Salvar" e "Nova Adquirente"
 * habilitados. Em `/settings/receiving` ele preenchia o formulário, clicava
 * Salvar e só então recebia 403 "Apenas proprietários podem alterar configurações
 * de recebimento". O backend estava certo — toda mutation de settings tem gate de
 * admin, por `tenantAdminProcedure` ou `isTenantAdmin` inline. A TELA mentia.
 *
 * Produção tem 2 contas de operador hoje, ambas no tenant que vende.
 *
 * A declaração é por exclusão (`SETTINGS_OPERATOR_TABS`): aba nova nasce restrita
 * ao admin. Estes testes existem para que a lista de exceções não cresça sem
 * intenção e para que a regra siga igual nos três consumidores (proxy, barra de
 * abas, menu lateral).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { isAdminOnlySettingsPath } from "@/lib/modules";
import { appNavItems, isNavItemVisible } from "@/components/layout/nav-items";

const SETTINGS_DIR = join(process.cwd(), "src/app/(app)/settings");

/** Abas que o operador deve continuar abrindo, com o motivo. */
const ABERTAS_AO_OPERADOR: Record<string, string> = {
  "/settings/security": "2FA/senha do próprio usuário; 2FA é pré-requisito de saque DePix",
  "/settings/delivery-persons": "operation.*DeliveryPerson não exige admin — é trabalho de operação",
};

function abasComPagina(): string[] {
  return readdirSync(SETTINGS_DIR)
    .filter((entrada) => {
      const caminho = join(SETTINGS_DIR, entrada);
      return statSync(caminho).isDirectory() && !entrada.startsWith("_");
    })
    .map((entrada) => `/settings/${entrada}`);
}

describe("CFG-6 — abas de Configurações restritas ao admin", () => {
  const abas = abasComPagina();

  it("encontra as abas de settings no disco", () => {
    // Sanidade: se a varredura parar de achar abas, o guardião vira decoração.
    expect(abas.length).toBeGreaterThan(10);
  });

  it("toda aba é restrita ao admin, exceto as declaradas", () => {
    const inesperadas = abas.filter(
      (aba) => !isAdminOnlySettingsPath(aba) && !(aba in ABERTAS_AO_OPERADOR),
    );
    expect(inesperadas).toEqual([]);
  });

  it("as abas declaradas abertas continuam abertas", () => {
    for (const aba of Object.keys(ABERTAS_AO_OPERADOR)) {
      expect(isAdminOnlySettingsPath(aba)).toBe(false);
    }
  });

  it("as declarações abertas apontam para abas que existem", () => {
    // Declaração órfã esconde a próxima aba que nascer com o mesmo nome.
    const orfas = Object.keys(ABERTAS_AO_OPERADOR).filter((aba) => !abas.includes(aba));
    expect(orfas).toEqual([]);
  });

  it("/settings sem sufixo é restrita (redireciona pra /settings/general)", () => {
    expect(isAdminOnlySettingsPath("/settings")).toBe(true);
  });

  it("sub-rota de aba aberta herda a abertura", () => {
    expect(isAdminOnlySettingsPath("/settings/security/2fa")).toBe(false);
    expect(isAdminOnlySettingsPath("/settings/receiving/qualquer")).toBe(true);
  });

  it("não afeta rota fora de /settings", () => {
    expect(isAdminOnlySettingsPath("/painel")).toBe(false);
    expect(isAdminOnlySettingsPath("/pdv")).toBe(false);
    // Prefixo parecido não conta como aba de settings.
    expect(isAdminOnlySettingsPath("/settingsfoo")).toBe(false);
  });
});

describe("CFG-6 — menu lateral do operador", () => {
  const itensDeSettings = appNavItems.filter((item) => item.href.startsWith("/settings"));
  const todosOsModulos = [
    "settings",
    "pdv",
    "tools",
    "service-orders",
    "stock",
    "cashier",
    "financial",
  ] as const;

  it("operador só vê as abas de settings abertas a ele", () => {
    const visiveis = itensDeSettings
      .filter((item) =>
        isNavItemVisible(item, {
          tenantSlug: "arena-tech",
          allowedModules: todosOsModulos,
          isTenantAdmin: false,
        }),
      )
      .map((item) => item.href);

    expect(visiveis).toEqual(["/settings/delivery-persons", "/settings/security"]);
  });

  it("admin continua vendo todas", () => {
    const visiveis = itensDeSettings.filter((item) =>
      isNavItemVisible(item, {
        tenantSlug: "arena-tech",
        allowedModules: todosOsModulos,
        isTenantAdmin: true,
      }),
    );
    expect(visiveis).toHaveLength(itensDeSettings.length);
  });

  it("nenhum item de menu do operador aponta para rota que o proxy barra", () => {
    // O menu e o proxy tinham que concordar: item visível que leva a redirect é
    // exatamente o beco que este achado descreve, invertido.
    for (const item of itensDeSettings) {
      const visivel = isNavItemVisible(item, {
        tenantSlug: "arena-tech",
        allowedModules: todosOsModulos,
        isTenantAdmin: false,
      });
      if (visivel) expect(isAdminOnlySettingsPath(item.href)).toBe(false);
    }
  });
});
