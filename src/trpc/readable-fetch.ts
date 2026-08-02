/**
 * `fetch` do cliente tRPC que transforma resposta não-JSON em erro legível.
 *
 * O `httpBatchLink` assume que toda resposta é JSON e chama `response.json()`
 * direto. Quando a borda devolve HTML — 502 do Cloudflare, página de manutenção,
 * 413/414 do proxy — quem estoura é o parser do navegador, com uma mensagem que
 * não diz nem o status nem a rota. No Safari ela é literalmente "The string did
 * not match the expected pattern.", e foi assim que 186 eventos em duas semanas
 * viraram um balde único e inútil no Sentry, atrás de rotas diferentes
 * (`receiving.*` com 502 no /pdv, `stock.searchSuppliers` com 400 no /stock/entry).
 *
 * Resposta de erro do PRÓPRIO tRPC continua passando intacta: ela vem com
 * `content-type: application/json` e o link sabe lê-la.
 */

/** Erro de transporte: a resposta não veio do tRPC, veio da infraestrutura. */
export class NonJsonResponseError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(describeTransportFailure(status));
    this.name = "NonJsonResponseError";
    this.status = status;
  }
}

/** Mensagem que o operador consegue agir em cima. */
function describeTransportFailure(status: number): string {
  if (status === 502 || status === 503 || status === 504) {
    return `Servidor indisponível no momento (${status}). Tente de novo em instantes.`;
  }
  if (status === 413 || status === 414) {
    return `A busca ficou grande demais para o servidor (${status}). Refine o filtro.`;
  }
  if (status === 429) {
    return "Muitas requisições seguidas (429). Espere um instante e tente de novo.";
  }
  return `O servidor respondeu ${status} sem conteúdo JSON.`;
}

function isJson(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").includes("application/json");
}

export async function readableFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  // `ok` ou JSON => o httpBatchLink dá conta (inclusive dos erros do tRPC).
  if (response.ok || isJson(response)) return response;
  throw new NonJsonResponseError(response.status);
}
