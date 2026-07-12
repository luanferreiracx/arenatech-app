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
    <main className="min-h-screen overflow-x-hidden bg-[var(--cat-bg)]">
      <CatalogHeader
        search={catalog.search}
        categories={catalog.categories}
        activeCategoryId={catalog.categoryId}
        sort={catalog.sort}
        totalAvailable={catalog.totalAvailable}
        contact={catalog.contact}
      />

      <div className="mx-auto w-full max-w-6xl px-4 pb-28 sm:px-6 lg:px-8">
        <div className="catalog-rise flex items-end justify-between gap-3 pb-3 pt-6">
          <div className="min-w-0">
            <h1 className="font-display truncate text-2xl font-bold leading-tight text-[var(--cat-ink)] sm:text-[1.75rem]">
              {heading}
            </h1>
            <p className="mt-0.5 text-sm text-[var(--cat-ink-soft)]">
              <span className="font-numeric font-semibold text-[var(--cat-ink)]">{catalog.total}</span>{" "}
              {catalog.total === 1 ? "produto disponível" : "produtos disponíveis"}
            </p>
          </div>
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="aspect-4/5 rounded-2xl bg-[var(--cat-surface-sunken)]" />
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
