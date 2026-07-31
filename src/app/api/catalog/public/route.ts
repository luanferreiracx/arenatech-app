import { NextRequest, NextResponse } from "next/server";
import { getPublicCatalog } from "@/server/services/public-catalog";
import { getCatalogSubdomainSlug } from "@/lib/brand-host";
import { logger } from "@/lib/logger";

/**
 * Catálogo público (anônimo), multi-tenant por subdomínio.
 *
 * CT-1: esta rota NÃO passava `tenantSlug`, e sem slug o serviço cai no tenant
 * padrão (`DEFAULT_TENANT_ID`/`arena-tech`). Resultado: `loja-b.pdvdepix.app/api/
 * catalog/public` devolvia os produtos e preços do **arena-tech** — catálogo do
 * vizinho no domínio da loja.
 *
 * As PÁGINAS (`/catalog`, `/catalog/[id]`) já faziam certo: leem
 * `x-catalog-tenant-slug`, que o proxy injeta no rewrite. Mas o proxy só reescreve
 * `/` e `/catalog*` — `/api/*` é isento de propósito (redirect em rota de API
 * quebra cliente JSON, incidente documentado), então o header nunca chegava aqui.
 *
 * A rota resolve o slug do próprio Host com a MESMA função do proxy
 * (`getCatalogSubdomainSlug`, que já valida caracteres e rejeita subdomínio
 * reservado) — uma regra, um lugar. Sem subdomínio de catálogo, o comportamento
 * antigo continua: cai no tenant padrão, que é o host legado
 * `catalogo.arenatechpi.com.br`.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const catalog = await getPublicCatalog({
      tenantSlug: getCatalogSubdomainSlug(host) ?? undefined,
      search: searchParams.get("q") ?? searchParams.get("search") ?? undefined,
      categoryId: searchParams.get("categoria") ?? searchParams.get("category") ?? undefined,
      sort: searchParams.get("ordem") ?? searchParams.get("sort") ?? undefined,
      page: parsePositiveInt(searchParams.get("page")),
      pageSize: parsePositiveInt(searchParams.get("pageSize")),
    });

    return NextResponse.json(catalog);
  } catch (error) {
    logger.error("Public catalog error", { error: String(error) });
    return NextResponse.json(
      { products: [], categories: [], total: 0, totalAvailable: 0, error: "Erro ao carregar catalogo" },
      { status: 500 },
    );
  }
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
