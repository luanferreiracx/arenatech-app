import { Suspense } from "react";
import { Logo } from "@/components/branding/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicCatalog } from "@/server/services/public-catalog";
import { CatalogFilters } from "./_components/catalog-filters";
import { CatalogList } from "./_components/catalog-list";

export const metadata = {
  title: "Catálogo | Arena Tech",
  description: "Produtos com foto disponíveis na Arena Tech.",
};

type CatalogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const catalog = await getPublicCatalog({
    search: readParam(params.q),
    categoryId: readParam(params.categoria),
    sort: readParam(params.ordem),
    page: readIntParam(params.page),
  });

  return (
    <main className="min-h-screen bg-[#050505] text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(201,165,92,0.14),transparent_44%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex justify-center py-4 sm:py-6">
          <Logo size="lg" className="opacity-95" />
        </header>

        <section className="mx-auto max-w-2xl pb-7 pt-3 text-center sm:pb-9 sm:pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/75">
            Catálogo Arena Tech
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl lg:text-4xl">
            Escolha com calma. Chame a loja quando encontrar o produto ideal.
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
            Produtos disponíveis, com foto e preço claro. Use a busca ou navegue por categorias para encontrar acessórios, periféricos e itens selecionados.
          </p>
        </section>

        <section className="grid gap-8 pb-16 lg:grid-cols-[260px_1fr] lg:items-start">
          <CatalogFilters
            categories={catalog.categories}
            activeCategoryId={catalog.categoryId}
            search={catalog.search}
            sort={catalog.sort}
            totalAvailable={catalog.totalAvailable}
          />
          <div>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/70">
                  {catalog.search ? `Resultados para “${catalog.search}”` : "Produtos disponíveis"}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-white">
                  {catalog.total} {catalog.total === 1 ? "produto encontrado" : "produtos encontrados"}
                </h2>
              </div>
              <p className="text-xs text-zinc-500">
                Página {catalog.page} de {catalog.pageCount}
              </p>
            </div>
            <Suspense fallback={<CatalogFallback />}>
              <CatalogList catalog={catalog} />
            </Suspense>
          </div>
        </section>
      </div>
    </main>
  );
}

function CatalogFallback() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-96 rounded-2xl bg-zinc-900" />
      ))}
    </div>
  );
}

function readParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function readIntParam(value: string | string[] | undefined): number | undefined {
  const param = readParam(value);
  if (!param) return undefined;
  const parsed = Number.parseInt(param, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
