/**
 * Guardião da higiene de caixa nos testes de integração (incidente 2026-07-27).
 *
 * O banco tem `cash_sessions_one_open_per_user`:
 *   UNIQUE (tenant_id, user_id) WHERE closed_at IS NULL
 *
 * Os testes de integração compartilham o mesmo Postgres local e quase todos
 * usam os mesmos usuários semeados. Dois padrões faziam a suíte falhar ~60% das
 * vezes, sempre num teste diferente conforme a ordem dos arquivos:
 *
 *  1. `prisma.cashSession.create(...)` direto — estoura a unique se outro
 *     arquivo deixou um caixa aberto para o mesmo usuário:
 *       Unique constraint failed on the fields: (`tenant_id`, `user_id`)
 *
 *  2. `prisma.cashSession.deleteMany({ where: { ..., closedAt: null } })` —
 *     APAGAR sessão alheia falha quando ela já tem movimentos:
 *       Foreign key constraint violated: cash_movements_cash_session_id_fkey
 *     O `beforeAll` morria e o arquivo inteiro era pulado (aparecia como
 *     "skipped", não como falha — mais difícil ainda de notar).
 *
 * `__tests__/helpers/cash-session.ts` resolve os dois: FECHA o que estiver
 * aberto (sem apagar, sem esbarrar em FK) antes de abrir o novo.
 *
 * Este teste impede a volta do padrão. Se um teste novo precisar mesmo criar a
 * sessão na mão (ex.: `openedAt` no passado, como o de auto-close), adicione o
 * arquivo à allowlist abaixo — de forma consciente.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "__tests__", "integration");

/**
 * Arquivos autorizados a criar a sessão na mão, com o motivo.
 * `cash-autoclose-...`: precisa de `openedAt` no passado (30h) para o cron de
 * fechamento automático enxergar a sessão como abandonada.
 */
const ALLOWLIST_CREATE = new Set(["cash-autoclose-no-fabricated-balance.test.ts"]);

function arquivos(): Array<{ nome: string; src: string }> {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".test.ts"))
    .map((nome) => ({ nome, src: readFileSync(join(DIR, nome), "utf8") }));
}

describe("higiene de caixa nos testes de integração", () => {
  it("ninguém cria cashSession direto (use openTestCashSession)", () => {
    const infratores = arquivos()
      .filter((a) => !ALLOWLIST_CREATE.has(a.nome))
      .filter((a) => /prisma\.cashSession\.create\(/.test(a.src))
      .map((a) => a.nome);
    expect(infratores).toEqual([]);
  });

  it("a suíte de integração roda em SÉRIE (--no-file-parallelism)", () => {
    // Medido em 2026-07-27: a suíte inteira em paralelo dá 15 falhas em 11
    // arquivos; em série, 0. Os arquivos compartilham tenant (`arena-tech`),
    // usuário (`Admin Arena`) e o caixa aberto dele — dois processos rodando ao
    // mesmo tempo fecham/abrem a sessão um do outro, e o perdedor quebra com
    // FK de `sale_items` ou com a unique de caixa. O helper de caixa resolve a
    // colisão DENTRO de um processo; não tem como resolver ENTRE processos.
    //
    // Custo de rodar em série: ~38s a suíte toda. Barato perto de caçar falha
    // fantasma. Se um dia cada arquivo tiver seu próprio tenant, isto pode cair.
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    expect(pkg.scripts["test:integration"]).toContain("--no-file-parallelism");
  });

  it("ninguém APAGA sessão aberta de outro teste (feche, não apague)", () => {
    // `deleteMany` filtrando `closedAt: null` alcança sessões de OUTROS
    // arquivos, que podem ter movimentos → viola a FK e derruba o beforeAll.
    // Apagar as PRÓPRIAS sessões por id continua permitido.
    const infratores = arquivos()
      .filter((a) => {
        // Normaliza quebras de linha para casar chamadas multi-linha sem
        // depender da flag `s` (dotAll), que exige target >= es2018.
        const plano = a.src.replace(/[\r\n]+/g, " ");
        return /cashSession\.deleteMany\([^)]*closedAt:\s*null/.test(plano);
      })
      .map((a) => a.nome);
    expect(infratores).toEqual([]);
  });
});
