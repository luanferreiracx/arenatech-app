/**
 * E8-3 (Etapa 8, Módulo 3 — Configurações): `settings.listAuditLogs` era
 * `tenantProcedure`.
 *
 * A **tela** já negava: `/settings/logs` não está em `SETTINGS_OPERATOR_TABS`,
 * então `settingsPathRequiresAdmin` redireciona o operador. Mas o **resolver**
 * respondia. Medido no navegador contra a cópia de produção, chamando o tRPC
 * direto como operador:
 *
 *     HTTP 200 | 50 registros | 19.634 bytes
 *
 * Segurança por obscuridade — o mesmo padrão do M9-3, onde o menu escondia
 * "Contas a Pagar" e o resolver entregava os dados.
 *
 * A trilha registra `reset_password`, `reset_two_factor` e `removed` de
 * usuários (quem administrou credencial de quem), além de valores de venda e
 * notas livres do operador. Hoje são 155 registros e 3 atores; os eventos de
 * credencial ainda não ocorreram, mas o caminho para lê-los estava aberto.
 *
 * ## Por que este teste olha o par tela↔resolver
 *
 * Proteger só um lado é o defeito, não a correção. Este arquivo afirma que toda
 * aba de Configurações negada ao operador na navegação tem o resolver
 * correspondente também negando.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/settings.ts"),
  "utf8",
);
const MODULES = readFileSync(join(process.cwd(), "src/lib/modules.ts"), "utf8");

function corpoDaProcedure(nome: string): string {
  const i = ROUTER.search(new RegExp(`^ {2}${nome}: (?:tenant|tenantAdmin|admin)Procedure`, "m"));
  if (i < 0) throw new Error(`procedure ${nome} não encontrada`);
  const resto = ROUTER.slice(i + 10);
  const prox = resto.search(/\n {2}\w+: (?:tenant|tenantAdmin|admin)Procedure/);
  return prox < 0 ? ROUTER.slice(i) : ROUTER.slice(i, i + 10 + prox);
}

/**
 * Leituras cujo conteúdo é de gestão, não de operação. `tenantAdminProcedure`
 * já basta — o gate inline seria redundante.
 */
const LEITURAS_DE_GESTAO = ["listAuditLogs"];

describe("E8-3 — leitura de trilha de auditoria é de admin", () => {
  for (const nome of LEITURAS_DE_GESTAO) {
    it(`${nome} exige admin no resolver, não só na tela`, () => {
      expect(
        ROUTER,
        `${nome} devolve a trilha de auditoria do tenant — inclui reset_password, ` +
          `reset_two_factor e removed de usuários. A tela redirecionar não basta: ` +
          `medido no navegador, a chamada direta ao tRPC devolvia 50 registros.`,
      ).toMatch(new RegExp(`^ {2}${nome}: tenantAdminProcedure`, "m"));
    });
  }
});

describe("a navegação e o resolver concordam", () => {
  it("/settings/logs continua fora das abas do operador", () => {
    const bloco = MODULES.slice(
      MODULES.indexOf("const SETTINGS_OPERATOR_TABS"),
      MODULES.indexOf("const SETTINGS_OPERATOR_TABS") + 300,
    );
    expect(
      bloco,
      "se /settings/logs entrar nas abas do operador, o gate de admin no " +
        "resolver passa a contradizer a navegação — decida os dois juntos.",
    ).not.toMatch(/\/settings\/logs/);
  });

  it("as mutations de configuração continuam gateadas (não regrediram)", () => {
    // Amostra das que o red team desta auditoria testou no navegador: as seis
    // devolveram 403 ao operador. O gate é inline (ADR 0053), não no procedure.
    const MUTATIONS = [
      "updateFiscalSettings",
      "updateReceiving",
      "createPaymentMethod",
      "removeFiscalCertificate",
      "deleteLogo",
      "uploadLogo",
    ];
    for (const nome of MUTATIONS) {
      expect(corpoDaProcedure(nome), `${nome} perdeu o gate de admin`).toMatch(
        /isTenantAdmin\(ctx\.session, ctx\.tenantId\)/,
      );
    }
  });
});
