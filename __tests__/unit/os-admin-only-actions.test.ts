/**
 * Etapa 7, Módulo 1 (M1-2): botões admin-only da OS visíveis ao operador.
 *
 * Medido no navegador, na cópia de produção, numa OS PAGA: o operador via os
 * botões **Estornar** e **Descancelar**. O servidor bloqueia os dois
 * (`isTenantAdmin` inline em `service-order.ts`, conforme o ADR 0053) — não era
 * vulnerabilidade. Era um botão vermelho que devolve dinheiro, oferecido a quem
 * não pode usá-lo, e que só falha depois do clique e do diálogo de confirmação.
 *
 * O que torna isto um lapso e não uma decisão: o botão **Excluir**, cinco linhas
 * acima do Estornar no mesmo JSX, TEM a guarda `isAdmin`. A regra estava ao lado.
 *
 * É o padrão que esta auditoria nomeou sete vezes: a correção fecha a instância,
 * não a classe. Este teste fecha a classe — afirma a paridade entre o gate do
 * SERVIDOR e a condição de render da TELA, para as três ações.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/service-order.ts"),
  "utf8",
);
const DETAIL = readFileSync(
  join(
    process.cwd(),
    "src/app/(app)/service-orders/[id]/_components/service-order-detail.tsx",
  ),
  "utf8",
);

/**
 * Ações que o servidor restringe a admin E que têm botão próprio no detalhe da
 * OS. Só entram aqui as que o operador consegue ver na tela — procedures
 * admin-only sem botão direto (ex.: `attachNfse`) não são cobertas.
 */
const ACOES_ADMIN_COM_BOTAO = ["refund", "uncancel", "delete"] as const;

/** O bloco JSX que renderiza o botão desta ação, até o fechamento da condição. */
function blocoDoBotao(acao: string): string {
  const gatilho = `dialog.open("${acao}")`;
  const pos = DETAIL.indexOf(gatilho);
  if (pos === -1) return "";
  // Volta até a abertura da expressão condicional que embrulha o botão.
  const inicio = DETAIL.lastIndexOf("{", DETAIL.lastIndexOf("<Button", pos));
  return DETAIL.slice(inicio, pos);
}

describe("M1-2 — ações admin-only da OS não aparecem para o operador", () => {
  for (const acao of ACOES_ADMIN_COM_BOTAO) {
    it(`servidor exige admin em '${acao}'`, () => {
      // Âncora do lado do servidor: se o gate sair de lá, o teste denuncia em vez
      // de passar por vacuidade.
      const trecho = ROUTER.slice(
        ROUTER.indexOf(`  ${acao}: tenantProcedure`),
        ROUTER.indexOf(`  ${acao}: tenantProcedure`) + 900,
      );
      expect(trecho).toMatch(/isTenantAdmin\(ctx\.session/);
    });

    it(`botão de '${acao}' só renderiza para admin`, () => {
      const bloco = blocoDoBotao(acao);
      expect(bloco, `botão de '${acao}' não encontrado no detalhe da OS`).not.toBe("");
      expect(
        bloco,
        `o botão de '${acao}' renderiza sem checar isAdmin — o servidor bloqueia, ` +
          `mas a tela oferece uma ação que sempre falha`,
      ).toMatch(/isAdmin/);
    });
  }
});
