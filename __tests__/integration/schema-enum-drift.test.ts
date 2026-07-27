/**
 * Guardião de DRIFT entre `schema.prisma` e o banco (auditoria 2026-07-25).
 *
 * O P0 daquela rodada foi exatamente isto: o schema declarava
 * `StockMovementType.RESERVE/RELEASE` desde o fluxo "peça na OS", mas NENHUMA
 * migration adicionou os valores ao banco. O Prisma Client é gerado do SCHEMA,
 * então o typecheck passava; o CI roda `migrate deploy` num banco LIMPO, que
 * reproduzia o mesmo drift. Só estourava em runtime, no INSERT.
 *
 * Resultado: adicionar peça/produto numa OS SEMPRE falhou — 235 itens de OS em
 * produção, 100% SERVICE, zero PRODUCT, com a UI oferecendo "Produto/Peça".
 *
 * Este teste compara TODOS os enums do schema com os do banco. Qualquer valor
 * declarado e não migrado quebra aqui, antes de virar bug de runtime.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/server/auth", () => ({ auth: async () => null }));
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

/** Enums declarados nos arquivos `prisma/schema/*.prisma`. */
function enumsFromSchema(): Map<string, Set<string>> {
  const dir = join(process.cwd(), "prisma", "schema");
  const out = new Map<string, Set<string>>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".prisma"))) {
    const src = readFileSync(join(dir, file), "utf8");
    for (const m of src.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g)) {
      const values = new Set(
        m[2]!
          .split("\n")
          .map((l) => l.replace(/\/\/.*$/, "").trim()) // tira comentário de linha
          .filter((l) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(l)),
      );
      out.set(m[1]!, values);
    }
  }
  return out;
}

afterAll(async () => {
  await prisma.$disconnect();
});

let dbEnums: Map<string, Set<string>>;

beforeAll(async () => {
  const rows = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
    SELECT t.typname, e.enumlabel
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  `;
  dbEnums = new Map();
  for (const r of rows) {
    const set = dbEnums.get(r.typname) ?? new Set<string>();
    set.add(r.enumlabel);
    dbEnums.set(r.typname, set);
  }
});

describe("schema.prisma × banco — sem drift de enum", () => {
  it("todo valor de enum declarado no schema existe no banco", () => {
    const faltando: string[] = [];
    for (const [name, values] of enumsFromSchema()) {
      const noBanco = dbEnums.get(name);
      if (!noBanco) {
        faltando.push(`${name}: enum inteiro ausente no banco`);
        continue;
      }
      for (const v of values) {
        if (!noBanco.has(v)) faltando.push(`${name}.${v}`);
      }
    }
    // Mensagem útil: lista exatamente o que falta migrar.
    expect(faltando).toEqual([]);
  });

  it("StockMovementType tem RESERVE e RELEASE (regressão do P0)", () => {
    const v = dbEnums.get("StockMovementType");
    expect(v).toBeDefined();
    expect(v!.has("RESERVE")).toBe(true);
    expect(v!.has("RELEASE")).toBe(true);
  });
});
