import { Suspense } from "react";
import { headers } from "next/headers";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicCatalog } from "@/server/services/public-catalog";
import { CatalogHeader } from "./_components/catalog-header";
import { CatalogList } from "./_components/catalog-list";
import { CatalogToolbar } from "./_components/catalog-toolbar";
import { WhatsAppFab } from "./_components/whatsapp-fab";

type CatalogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  // Slug do tenant injetado pelo proxy a partir do subdomínio (<slug>.pdvdepix.app).
  const tenantSlug = (await headers()).get("x-catalog-tenant-slug") ?? undefined;
  const catalog = await getPublicCatalog({
    search: readParam(params.q),
    categoryId: readParam(params.categoria),
    sort: readParam(params.ordem),
    page: readIntParam(params.page),
    tenantSlug,
  });

  const heading = catalog.search
    ? `Resultados para “${catalog.search}”`
    : catalog.categoryId
      ? catalog.categories.find((category) => category.id === catalog.categoryId)?.name ?? "Produtos"
      : "Tudo disponível";

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <div className="catalog-atmosphere" aria-hidden />
      <div className="catalog-grain" aria-hidden />

      <CatalogHeader
        search={catalog.search}
        categories={catalog.categories}
        activeCategoryId={catalog.categoryId}
        sort={catalog.sort}
        totalAvailable={catalog.totalAvailable}
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-28 sm:px-6 lg:px-8">
        <div className="catalog-rise mb-5 flex items-end justify-between gap-3 border-b border-white/10 pb-4 pt-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--gold)]/80">
              Catálogo
            </p>
            <h1 className="font-display mt-1 text-2xl font-semibold leading-tight text-white sm:text-3xl">
              {heading}
            </h1>
          </div>
          <p className="shrink-0 pb-1 text-right text-sm text-zinc-400">
            <span className="font-numeric text-white">{catalog.total}</span>{" "}
            {catalog.total === 1 ? "item" : "itens"}
          </p>
        </div>

        <div className="mb-6">
          <CatalogToolbar
            search={catalog.search}
            categories={catalog.categories}
            activeCategoryId={catalog.categoryId}
            sort={catalog.sort}
          />
        </div>

        <Suspense fallback={<CatalogFallback />}>
          <CatalogList catalog={catalog} />
        </Suspense>
      </div>

      <WhatsAppFab
        whatsappNumber={catalog.contact.whatsappNumber}
        storeName={catalog.contact.storeName}
      />
    </main>
  );
}

function CatalogFallback() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="aspect-3/4 rounded-3xl bg-white/5" />
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
