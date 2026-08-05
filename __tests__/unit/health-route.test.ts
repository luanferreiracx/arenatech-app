/**
 * Auditoria 2026-08-05, P1-B3: `/api/health` estava na allowlist de rotas
 * públicas (`public-routes.ts:75`) desde sempre e **a rota nunca foi criada** —
 * em produção devolvia 404 com HTML. Somado a isso, o container do app não tinha
 * `HEALTHCHECK` e nada externo batia no endpoint: o processo que serve todos os
 * clientes não era monitorado por ninguém.
 *
 * O que este teste protege não é o 200 (isso um `return NextResponse.json({})`
 * faria): é o **503 quando o banco cai**. Um healthcheck que devolve 200 fixo
 * sobe junto com o processo e nunca muda de ideia — é o tipo de monitoramento
 * que parece existir e não presta.
 */
import { describe, it, expect, vi } from "vitest";

const queryRaw = vi.fn();

// O wrapper é obrigatório: `vi.mock` é içado para o topo do arquivo, então
// referenciar `queryRaw` direto dentro da factory dá ReferenceError.
vi.mock("@/server/db", () => ({
  prisma: { $queryRaw: (...a: unknown[]) => queryRaw(...a) },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "@/app/api/health/route";

/**
 * Cada teste define a implementação inteira do mock, sem `beforeEach` de reset:
 * `mockReset` apaga a implementação e o `vi.fn()` passa a devolver `undefined`,
 * então o `await` da rota resolve e o `catch` nunca roda — os testes de erro
 * falhavam por causa do harness, não da rota.
 */
function bancoOk() {
  queryRaw.mockImplementation(() => Promise.resolve([{ ok: 1 }]));
}
function bancoFora(msg: string) {
  queryRaw.mockImplementation(() => {
    throw new Error(msg);
  });
}

describe("/api/health", () => {
  it("banco respondendo -> 200 ok", async () => {
    bancoOk();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", db: "up" });
  });

  it("banco INACESSIVEL -> 503 degraded (o caso que importa)", async () => {
    bancoFora("Connection terminated unexpectedly");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "degraded", db: "down" });
  });

  it("nunca lanca — healthcheck que estoura 500 e pior que nao ter", async () => {
    bancoFora("erro qualquer");
    await expect(GET()).resolves.toBeDefined();
  });

  it("nao vaza detalhe do erro (rota publica)", async () => {
    bancoFora("password authentication failed for user arenatech");
    const body = await (await GET()).json();
    expect(JSON.stringify(body)).not.toMatch(/password|arenatech|authentication/i);
  });

  it("nao e cacheado (Cache-Control: no-store)", async () => {
    bancoOk();
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
