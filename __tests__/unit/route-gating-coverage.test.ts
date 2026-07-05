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
import { resolveModuleForPath, isRouteAllowedForTenant } from "@/lib/modules";

const APP_DIR = join(process.cwd(), "src", "app", "(app)");

/**
 * Rotas top-level SEM módulo por design:
 * - painel: dashboard (infra mínima, sempre disponível).
 * - dev: ferramentas de desenvolvimento; a própria página bloqueia produção/não-admin.
 */
const ALWAYS_ON_ROUTES = new Set(["painel", "dev"]);

/** Diretórios que não são rotas top-level reais. */
const IGNORED = new Set(["_components"]);

function topLevelRoutes(): string[] {
  return readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && !IGNORED.has(entry.name))
    .map((entry) => entry.name);
}

describe("cobertura de gating de rota", () => {
  it("toda rota top-level de (app) tem gating explícito (módulo, slug ou sempre-on)", () => {
    const uncovered: string[] = [];

    for (const route of topLevelRoutes()) {
      if (ALWAYS_ON_ROUTES.has(route)) continue;

      const pathname = `/${route}`;
      const hasModule = resolveModuleForPath(pathname) !== null;
      // Um tenant sem nenhum módulo e sem o slug da allowlist não deve acessar
      // uma rota gateada. Se ele PODE, a rota está passando livre (buraco).
      const blockedForBareTenant = !isRouteAllowedForTenant(pathname, { slug: "loja-x", modules: [] });

      if (!hasModule && !blockedForBareTenant) {
        uncovered.push(route);
      }
    }

    expect(uncovered, `Rotas sem gating (adicione módulo/slug ou allowlist sempre-on): ${uncovered.join(", ")}`).toEqual([]);
  });

  it("iphone-hunter é bloqueado para tenant comum, mesmo com todos os módulos", () => {
    const allModules = ["wallet", "depix-ops", "service-orders", "customers", "tools", "pdv", "stock", "cashier", "financial", "fiscal", "commissions", "settings"];
    expect(isRouteAllowedForTenant("/iphone-hunter", { slug: "loja-x", modules: allModules })).toBe(false);
    expect(isRouteAllowedForTenant("/iphone-hunter", { slug: "arena-tech", modules: allModules })).toBe(true);
  });
});
