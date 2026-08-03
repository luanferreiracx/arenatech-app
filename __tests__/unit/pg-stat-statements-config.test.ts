/**
 * Guardião do `pg_stat_statements` no compose.
 *
 * O módulo mede QUAL query custa caro em produção, com dados e concorrência
 * reais — sem ele, otimizar é adivinhação (`EXPLAIN` responde sobre a query que
 * você já suspeita; o gargalo real costuma ser uma que ninguém olhou, barata
 * sozinha e executada dez mil vezes).
 *
 * Este teste existe porque a configuração tem duas propriedades que a tornam
 * fácil de quebrar em silêncio:
 *
 * 1. **Depende de `shared_preload_libraries`**, que só é lido no START do
 *    servidor. Quem remover o `command` num refactor não vê erro nenhum: o
 *    Postgres sobe normalmente, as queries rodam normalmente, e apenas a
 *    MEDIÇÃO some. O sintoma aparece semanas depois, quando alguém for
 *    diagnosticar lentidão e achar a view vazia.
 * 2. **O primeiro item do `command` precisa ser `postgres`.** O `command` do
 *    Compose substitui o CMD da imagem, mas o entrypoint oficial continua
 *    rodando e recebe estes argumentos. Sem `postgres` na frente, o entrypoint
 *    não reconhece o comando como "subir o servidor" — o container executa
 *    outra coisa e o banco não sobe. É o tipo de detalhe que só se descobre
 *    quebrando produção.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const COMPOSES = [
  { arquivo: "docker-compose.prod.yml", rotulo: "produção" },
  { arquivo: "docker-compose.yml", rotulo: "desenvolvimento" },
] as const;

/** Recorta o bloco do serviço `postgres` (até o começo do próximo serviço). */
function servicoPostgres(conteudo: string): string {
  const inicio = conteudo.indexOf("\n  postgres:");
  if (inicio === -1) throw new Error("serviço `postgres` não encontrado no compose");
  const resto = conteudo.slice(inicio + 1);
  // Próxima chave no mesmo nível de indentação (2 espaços).
  const fim = resto.slice(1).search(/\n {2}[a-z_-]+:/);
  return fim === -1 ? resto : resto.slice(0, fim + 1);
}

describe.each(COMPOSES)("pg_stat_statements no compose de $rotulo", ({ arquivo }) => {
  const bloco = servicoPostgres(readFileSync(join(process.cwd(), arquivo), "utf8"));

  it("carrega a biblioteca no start do servidor", () => {
    // Sem o preload, `CREATE EXTENSION pg_stat_statements` falha e nenhuma
    // estatística é coletada.
    expect(bloco).toContain("shared_preload_libraries=pg_stat_statements");
  });

  it("o command começa com `postgres` — senão o banco não sobe", () => {
    const linhas = bloco
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const iCommand = linhas.findIndex((l) => l === "command:");
    expect(iCommand, "serviço postgres sem `command:`").toBeGreaterThanOrEqual(0);
    // O primeiro item da lista YAML logo após `command:`.
    expect(linhas[iCommand + 1]).toBe("- postgres");
  });

  it("persiste as estatísticas entre restarts", () => {
    // Sem `save=on`, todo deploy zera o histórico — e a pergunta que o módulo
    // existe para responder ("o que custou caro nas últimas semanas") morre
    // junto.
    expect(bloco).toContain("pg_stat_statements.save=on");
  });
});

describe("extensão no init do Postgres", () => {
  const init = readFileSync(
    join(process.cwd(), "docker", "postgres", "init", "01-extensions.sql"),
    "utf8",
  );

  it("cria a extensão em ambiente novo", () => {
    expect(init).toMatch(/CREATE EXTENSION IF NOT EXISTS "?pg_stat_statements"?/i);
  });

  it("avisa que o init NÃO roda em banco que já existe", () => {
    // O diretório só é executado com o volume de dados VAZIO. Sem este aviso,
    // alguém edita o arquivo, faz deploy e acha que aplicou em produção — onde
    // a extensão precisa ser criada à mão.
    expect(init).toMatch(/volume de dados está VAZIO|só roda quando/i);
  });
});
