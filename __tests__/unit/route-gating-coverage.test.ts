/**
 * Teste-guardião do gating de rota. Varre TODAS as páginas de `(app)` e exige
 * que cada rota top-level esteja explicitamente coberta por uma das dimensões
 * de gating (módulo, restrição de slug) ou por uma allowlist de rotas sempre-on
 * (infra: painel; ou auto-protegidas: dev). Uma rota nova sem cobertura FALHA
 * aqui — impede reintroduzir o buraco do iphone-hunter (visível só no menu, mas
 * acessível por URL para qualquer tenant).
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  resolveModuleForPath,
  isRouteAllowedForTenant,
  isUngatedByDesign,
} from "@/lib/modules";

const APP_DIR = join(process.cwd(), "src", "app", "(app)");

/** Diretórios que não são rotas top-level reais. */
const IGNORED = new Set(["_components"]);

/** Todos os módulos — um tenant "completo" pra testar rotas com gating de módulo. */
const ALL_MODULES = [
  "wallet", "depix-ops", "service-orders", "customers", "tools", "pdv",
  "stock", "cashier", "financial", "fiscal", "commissions", "settings",
];

function topLevelRoutes(): string[] {
  return readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && !IGNORED.has(entry.name))
    .map((entry) => entry.name);
}

describe("cobertura de gating de rota", () => {
  it("toda rota top-level de (app) é registrada (módulo, slug ou sem-gating por design)", () => {
    // Sob FAIL-CLOSED, uma rota nova não-registrada é NEGADA — o dono do feature
    // descobriria só testando. Este guardião flagra a rota antes: exige que cada
    // rota case um módulo, uma restrição de slug, ou o allowlist sem-gating.
    const uncovered: string[] = [];

    for (const route of topLevelRoutes()) {
      const pathname = `/${route}`;
      const hasModule = resolveModuleForPath(pathname) !== null;
      // Restrita por slug: acessível ao tenant do slug (arena-tech), o que prova
      // que é gateada por slug (e não um buraco).
      const slugGated = isRouteAllowedForTenant(pathname, { slug: "arena-tech", modules: ALL_MODULES });
      const ungated = isUngatedByDesign(pathname);

      if (!hasModule && !slugGated && !ungated) {
        uncovered.push(route);
      }
    }

    expect(uncovered, `Rotas não-registradas (serão NEGADAS por fail-closed — registre módulo/slug ou adicione ao allowlist sem-gating): ${uncovered.join(", ")}`).toEqual([]);
  });

  it("FAIL-CLOSED: rota desconhecida/não-registrada é NEGADA mesmo com todos os módulos", () => {
    // O coração do fix G-P1-18: sem módulo E sem estar no allowlist → negada.
    expect(isRouteAllowedForTenant("/rota-nova-nao-registrada", { slug: "loja-x", modules: ALL_MODULES })).toBe(false);
    expect(isRouteAllowedForTenant("/settings/aba-nova-fantasma", { slug: "loja-x", modules: ALL_MODULES })).toBe(true); // cai no fallback "settings" (sempre-on) — comportamento existente
  });

  it("rotas sem-gating por design continuam acessíveis a qualquer tenant", () => {
    for (const p of ["/painel", "/dev/components", "/change-password", "/no-access", "/settings/security", "/settings/users/new"]) {
      expect(isRouteAllowedForTenant(p, { slug: "loja-x", modules: [] }), `${p} deveria passar`).toBe(true);
    }
  });

  it("iphone-hunter é bloqueado para tenant comum, mesmo com todos os módulos", () => {
    const allModules = ["wallet", "depix-ops", "service-orders", "customers", "tools", "pdv", "stock", "cashier", "financial", "fiscal", "commissions", "settings"];
    expect(isRouteAllowedForTenant("/iphone-hunter", { slug: "loja-x", modules: allModules })).toBe(false);
    expect(isRouteAllowedForTenant("/iphone-hunter", { slug: "arena-tech", modules: allModules })).toBe(true);
  });
});
