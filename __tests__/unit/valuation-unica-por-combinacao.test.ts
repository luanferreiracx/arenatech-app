/**
 * E8-4 (Etapa 8, Módulo 4 — Avaliação de aparelhos): a tabela de preços não
 * tinha **nenhuma** constraint impedindo duas linhas ATIVAS para a mesma
 * combinação `(tenant, modelo, armazenamento, bateria)`, e o `create` não
 * checava duplicata.
 *
 * `device_valuations` é a tabela de preços que a loja **paga** ao cliente pelo
 * aparelho usado — 232 linhas, 37 modelos, R$ 100 a R$ 5.000 em produção.
 *
 * ## Provado no navegador
 *
 * Duas inserções da mesma combinação, com valores diferentes, **ambas aceitas**:
 *
 *     1ª (R$ 1.000) -> HTTP 200
 *     2ª (R$ 5.000) -> HTTP 200   <- mesma combinação
 *
 * `sendWhatsApp` monta a tabela a partir dessas linhas. O **cliente** receberia
 * duas linhas "Bateria > 90%" com R$ 1.000 e R$ 5.000 — e a loja não teria
 * resposta para "qual vale?".
 *
 * Impacto medido: **0 duplicatas em produção hoje**. Correção preventiva, antes
 * do primeiro erro de digitação.
 *
 * ## Por que índice PARCIAL
 *
 * O soft delete é o padrão do projeto (`deleted_at`). Um `UNIQUE` simples
 * impediria recadastrar uma combinação que foi apagada — quebraria um fluxo
 * legítimo. O índice tem `WHERE deleted_at IS NULL`.
 *
 * Verificado contra a cópia de produção, os três comportamentos:
 *
 * | ação | resultado |
 * |---|---|
 * | primeira inserção | passa |
 * | duplicata ativa | **recusada** (`device_valuations_ativa_unica`) |
 * | recadastro após soft delete | passa |
 *
 * O `try/catch` no `create` não é a garantia — é a **tradução**. Sem ele, o
 * admin recebe um 500 opaco em vez de saber que a combinação já existe.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROUTER = readFileSync(
  join(process.cwd(), "src/server/api/routers/valuation.ts"),
  "utf8",
);

/** Lê a migration que cria o índice, achando-a pelo conteúdo (não pelo nome). */
function migrationDoIndice(): string {
  const dir = join(process.cwd(), "prisma/migrations");
  for (const nome of readdirSync(dir)) {
    const arquivo = join(dir, nome, "migration.sql");
    try {
      const sql = readFileSync(arquivo, "utf8");
      if (sql.includes("device_valuations_ativa_unica")) return sql;
    } catch {
      // diretório sem migration.sql — segue
    }
  }
  return "";
}

describe("E8-4 — uma combinação ativa tem um preço só", () => {
  const SQL = migrationDoIndice();

  it("existe migration criando o índice único", () => {
    expect(
      SQL,
      "sem o índice, duas linhas ativas para a mesma combinação são aceitas e o " +
        "cliente recebe dois preços diferentes para o mesmo aparelho.",
    ).not.toBe("");
  });

  it("o índice cobre a combinação inteira", () => {
    for (const coluna of ["tenant_id", "modelo", "armazenamento", "saude_bateria"]) {
      expect(SQL, `coluna ${coluna} fora do índice`).toMatch(coluna);
    }
  });

  it("é PARCIAL: linha apagada não bloqueia recadastro", () => {
    expect(
      SQL,
      "sem `WHERE deleted_at IS NULL`, apagar e recadastrar a mesma combinação " +
        "passa a falhar — soft delete é o padrão do projeto.",
    ).toMatch(/WHERE\s+deleted_at IS NULL/i);
  });
});

describe("o erro do banco vira mensagem que o admin entende", () => {
  it("create traduz P2002 em CONFLICT", () => {
    const i = ROUTER.indexOf("  create: tenantProcedure");
    const corpo = ROUTER.slice(i, i + 2200);
    expect(corpo).toMatch(/P2002/);
    expect(corpo).toMatch(/CONFLICT/);
  });

  it("a mensagem diz QUAL combinação colidiu", () => {
    const i = ROUTER.indexOf("P2002");
    const corpo = ROUTER.slice(i, i + 400);
    // sem os três campos, o admin sabe que falhou mas não o quê editar
    expect(corpo).toMatch(/input\.modelo/);
    expect(corpo).toMatch(/input\.armazenamento/);
    expect(corpo).toMatch(/input\.saudeBateria/);
  });
});
