/**
 * Teto de conexões do pool.
 *
 * O defeito que isto guarda: com o driver adapter do Prisma 7 quem gerencia o
 * pool é o `pg`, cujo default é **10**. O `connection_limit` da URL — o jeito de
 * ajustar isso no Prisma clássico — é parâmetro do engine, e o adapter ignora.
 * Ou seja: o teto ficava em 10 e nenhuma string de conexão mudava isso.
 *
 * Dez é pouco por causa do RLS: `SET LOCAL` só vale dentro de transação, então
 * toda procedure (inclusive leitura) segura uma conexão pelo tempo todo. O teto
 * do pool É o teto de requisições simultâneas que tocam o banco, e passar dele
 * não dá lentidão — dá erro de transação após 10s de espera.
 *
 * Medido em produção: `max_connections` = 100, uso corrente de 2 a 7.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL = process.env.DATABASE_POOL_MAX;

/** Importa o módulo do zero para reler o env. */
async function loadPoolSize(value: string | undefined): Promise<number> {
  if (value === undefined) delete process.env.DATABASE_POOL_MAX;
  else process.env.DATABASE_POOL_MAX = value;

  const captured: { max?: number } = {};
  // `db.ts` memoiza o client em `globalThis` para sobreviver ao hot reload do
  // dev. Sem limpar, o segundo import devolve a instância antiga e o construtor
  // do adapter nunca roda de novo — o mock não captura nada.
  delete (globalThis as { prisma?: unknown }).prisma;
  vi.resetModules();
  vi.doMock("@prisma/adapter-pg", () => ({
    PrismaPg: class {
      constructor(config: { max?: number }) {
        captured.max = config.max;
      }
    },
  }));
  vi.doMock("@prisma/client", () => ({ PrismaClient: class {} }));
  process.env.APP_DATABASE_URL = "postgresql://u:p@localhost:5432/d";

  await import("@/server/db");
  return captured.max!;
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DATABASE_POOL_MAX;
  else process.env.DATABASE_POOL_MAX = ORIGINAL;
  vi.doUnmock("@prisma/adapter-pg");
  vi.doUnmock("@prisma/client");
});

describe("tamanho do pool de conexões", () => {
  it("é passado explicitamente ao adapter, não deixado no default do pg", async () => {
    const max = await loadPoolSize(undefined);
    expect(max).toBeDefined();
    expect(max).toBeGreaterThan(10); // o default do `pg` é 10
  });

  it("respeita DATABASE_POOL_MAX", async () => {
    expect(await loadPoolSize("40")).toBe(40);
  });

  it("valor inválido cai no padrão em vez de virar NaN ou zero", async () => {
    // Pool 0 ou NaN travaria o app inteiro em produção sem dizer por quê.
    expect(await loadPoolSize("abacaxi")).toBeGreaterThan(10);
    expect(await loadPoolSize("0")).toBeGreaterThan(10);
    expect(await loadPoolSize("-5")).toBeGreaterThan(10);
  });

  it("fica com folga sob o max_connections de 100 do Postgres de produção", async () => {
    // Precisa sobrar para migrations, crons, psql de operação e o segundo
    // container durante o deploy.
    const max = await loadPoolSize(undefined);
    expect(max).toBeLessThanOrEqual(40);
  });
});
