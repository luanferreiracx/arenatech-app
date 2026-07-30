/**
 * Finalização — Módulo 10, CFG-2: guardião de cobertura do gating REST.
 *
 * O gate por plano vivia só na borda tRPC. As rotas REST autenticadas por sessão
 * (PDFs, CSVs, uploads, SSE) ficavam sem nada: o proxy isenta `/api/*` de
 * propósito (um redirect 307 → HTML quebra o cliente JSON) e o `tenantProcedure`
 * não passa por elas. Resultado: um tenant wallet-only não chamava `stock.*` pelo
 * tRPC, mas baixava o PDF de posição de estoque pela rota REST equivalente.
 *
 * `tenantProcedure` + RLS garantem **isolamento** (o dado é do tenant certo), não
 * **gating de plano**.
 *
 * Este teste falha quando uma rota REST nova nasce dentro de um módulo pago sem
 * o gate — o mesmo papel que o guardião de cobertura do gating de rota já faz
 * para as páginas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const API_DIR = join(process.cwd(), "src/app/api");

/**
 * Rotas que NÃO precisam do gate, com o motivo. Adicionar aqui é uma decisão
 * consciente — o teste obriga a declará-la.
 */
const SEM_GATE: Record<string, string> = {
  "trpc/[trpc]": "a própria borda tRPC aplica o gate em tenantProcedure",
  "auth/[...nextauth]": "autenticação; não pertence a módulo",
  "catalog/public": "catálogo público por design",
  "storage/[...path]": "servidor de arquivo; autoriza pelo caminho assinado",
  "simulator/pdf": "formatador puro, sem leitura de banco; exige sessão (CFG-2)",
};

/** Prefixos inteiros dispensados, com motivo. */
const PREFIXOS_SEM_GATE: Array<[string, string]> = [
  ["cron/", "autentica por CRON_SECRET; não tem sessão nem tenant"],
  ["webhooks/", "autentica por assinatura HMAC do provedor"],
  ["v1/partner/", "autentica por API-key do parceiro + apiAccessEnabled"],
  ["whatsapp-media/", "token público assinado com expiração"],
];

function listarRotas(dir: string, prefixo = ""): string[] {
  const encontradas: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      encontradas.push(...listarRotas(caminho, prefixo ? `${prefixo}/${entrada}` : entrada));
    } else if (entrada === "route.ts") {
      encontradas.push(prefixo);
    }
  }
  return encontradas;
}

describe("CFG-2 — toda rota REST de módulo pago tem gate de plano", () => {
  const rotas = listarRotas(API_DIR);

  it("encontra as rotas REST do app", () => {
    // Sanidade: se a varredura parar de achar rotas, o guardião vira decoração.
    expect(rotas.length).toBeGreaterThan(30);
  });

  it("nenhuma rota de módulo pago está sem o gate", () => {
    const semGate: string[] = [];

    for (const rota of rotas) {
      if (rota in SEM_GATE) continue;
      if (PREFIXOS_SEM_GATE.some(([p]) => rota.startsWith(p))) continue;

      const fonte = readFileSync(join(API_DIR, rota, "route.ts"), "utf8");
      // Rota que não lê sessão não é de módulo (é pública ou tem outro gate).
      if (!fonte.includes("auth()")) continue;
      if (!fonte.includes("isModuleAllowedForTenant")) semGate.push(rota);
    }

    expect(semGate).toEqual([]);
  });

  it("as dispensas declaradas continuam existindo", () => {
    // Dispensa que aponta para rota inexistente é lixo acumulando — e esconde a
    // próxima rota que nascer com o mesmo nome.
    const orfas = Object.keys(SEM_GATE).filter((r) => !rotas.includes(r));
    expect(orfas).toEqual([]);
  });
});
