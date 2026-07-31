/**
 * Finalização — Módulo 13, CT-1: a rota REST do catálogo público resolve o tenant
 * pelo subdomínio, como as páginas já faziam.
 *
 * `getPublicCatalog` trata `tenantSlug` como fonte primária e, sem ele, cai no
 * tenant padrão (`DEFAULT_TENANT_ID` / `arena-tech`). A rota não passava nada:
 * `loja-b.pdvdepix.app/api/catalog/public` devolvia os produtos e preços do
 * **arena-tech** — catálogo do vizinho no domínio da loja.
 *
 * As páginas liam `x-catalog-tenant-slug`, injetado pelo proxy no rewrite; mas o
 * proxy só reescreve `/` e `/catalog*`, e `/api/*` é isento de propósito (redirect
 * em rota de API quebra cliente JSON). O header nunca chegava aqui.
 *
 * O teste bate na rota com hosts diferentes e confere QUAL slug ela repassa ao
 * serviço — que é a decisão em jogo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type ArgsCatalogo = { tenantSlug?: string; search?: string; page?: number };

const getPublicCatalog = vi.fn(async (_args: ArgsCatalogo) => ({
  products: [],
  categories: [],
  total: 0,
  totalAvailable: 0,
  page: 1,
  pageSize: 24,
  pageCount: 1,
}));

vi.mock("@/server/services/public-catalog", () => ({
  getPublicCatalog: (args: unknown) => getPublicCatalog(args as never),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const { GET } = await import("@/app/api/catalog/public/route");

/** Requisição mínima com o Host que interessa. */
function pedido(host: string, query = "") {
  return {
    url: `https://${host}/api/catalog/public${query}`,
    headers: new Headers({ host }),
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => getPublicCatalog.mockClear());

describe("CT-1 — catálogo público resolve o tenant pelo subdomínio", () => {
  it("subdomínio da loja manda o slug da loja", async () => {
    await GET(pedido("loja-b.pdvdepix.app"));

    expect(getPublicCatalog).toHaveBeenCalledTimes(1);
    const args = getPublicCatalog.mock.calls[0]![0];
    expect(args.tenantSlug, "sem isto a loja-b via o catálogo do arena-tech").toBe("loja-b");
  });

  it("host legado sem subdomínio segue no tenant padrão", async () => {
    // `catalogo.arenatechpi.com.br` é o host antigo, de um tenant só — o
    // comportamento de cair no default é deliberado ali.
    await GET(pedido("catalogo.arenatechpi.com.br"));

    const args = getPublicCatalog.mock.calls[0]![0];
    expect(args.tenantSlug).toBeUndefined();
  });

  it("subdomínio reservado não vira slug de tenant", async () => {
    await GET(pedido("www.pdvdepix.app"));

    const args = getPublicCatalog.mock.calls[0]![0];
    expect(args.tenantSlug).toBeUndefined();
  });

  it("os filtros continuam chegando ao serviço", async () => {
    await GET(pedido("loja-b.pdvdepix.app", "?q=iphone&page=2"));

    const args = getPublicCatalog.mock.calls[0]![0];
    expect(args.search).toBe("iphone");
    expect(args.page).toBe(2);
  });
});
