/**
 * readableFetch: o `fetch` do cliente tRPC precisa deixar passar tudo que o
 * httpBatchLink sabe ler e converter o resto num erro que nomeia o problema.
 *
 * Sem ele, uma pagina de erro em HTML da borda chegava ao parser do navegador e
 * virava um erro de sintaxe anonimo — 186 eventos no Sentry em duas semanas, num
 * balde unico, sem status nem rota.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readableFetch, NonJsonResponseError } from "@/trpc/readable-fetch";

const JSON_HEADERS = { "content-type": "application/json" };
const HTML_HEADERS = { "content-type": "text/html; charset=utf-8" };

function mockFetch(response: Response) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readableFetch", () => {
  it("deixa passar a resposta de sucesso", async () => {
    mockFetch(new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS }));
    const res = await readableFetch("/api/trpc/foo");
    expect(res.status).toBe(200);
  });

  // Erro do PROPRIO tRPC vem em JSON com status 4xx/5xx — o link sabe ler e
  // transformar em TRPCClientError com codigo e mensagem de negocio. Interceptar
  // aqui apagaria essa informacao.
  it("deixa passar erro do tRPC (nao-ok, mas JSON)", async () => {
    mockFetch(
      new Response(JSON.stringify({ error: { message: "sem permissao" } }), {
        status: 403,
        headers: JSON_HEADERS,
      }),
    );
    const res = await readableFetch("/api/trpc/foo");
    expect(res.status).toBe(403);
  });

  it("502 em HTML -> NonJsonResponseError com o status preservado", async () => {
    mockFetch(new Response("<html>502 Bad Gateway</html>", { status: 502, headers: HTML_HEADERS }));
    await expect(readableFetch("/api/trpc/foo")).rejects.toThrowError(NonJsonResponseError);
    await expect(readableFetch("/api/trpc/foo")).rejects.toMatchObject({ status: 502 });
  });

  it.each([
    [502, /indispon/i],
    [503, /indispon/i],
    [504, /indispon/i],
    [413, /grande demais/i],
    [414, /grande demais/i],
    [429, /muitas requisi/i],
  ])("status %i vira mensagem acionavel", async (status, pattern) => {
    mockFetch(new Response("<html>erro</html>", { status, headers: HTML_HEADERS }));
    await expect(readableFetch("/api/trpc/foo")).rejects.toThrowError(pattern);
  });

  it("status sem mensagem dedicada ainda diz o numero", async () => {
    mockFetch(new Response("<html>erro</html>", { status: 418, headers: HTML_HEADERS }));
    await expect(readableFetch("/api/trpc/foo")).rejects.toThrowError(/418/);
  });

  it("resposta sem content-type nenhum e nao-ok -> tratada como nao-JSON", async () => {
    mockFetch(new Response("", { status: 502 }));
    await expect(readableFetch("/api/trpc/foo")).rejects.toThrowError(NonJsonResponseError);
  });
});
