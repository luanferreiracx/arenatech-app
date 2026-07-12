import { Suspense } from "react";
import { headers } from "next/headers";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicCatalog } from "@/server/services/public-catalog";
import { CatalogShell } from "./_components/catalog-shell";
import { CatalogResultsBar } from "./_components/catalog-results-bar";
import { CatalogList } from "./_components/catalog-list";

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
    <CatalogShell
      search={catalog.search}
      categories={catalog.categories}
      activeCategoryId={catalog.categoryId}
      sort={catalog.sort}
      totalAvailable={catalog.totalAvailable}
      contact={catalog.contact}
    >
      <CatalogResultsBar
        heading={heading}
        total={catalog.total}
        search={catalog.search}
        activeCategoryId={catalog.categoryId}
        sort={catalog.sort}
      />
      <div className="px-4 pb-24 pt-5 sm:px-6 lg:px-7">
        <Suspense fallback={<CatalogFallback />}>
          <CatalogList catalog={catalog} />
        </Suspense>
      </div>
    </CatalogShell>
  );
}

function CatalogFallback() {
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, index) => (
        <Skeleton key={index} className="aspect-4/5 rounded-xl bg-[var(--cat-surface-sunken)]" />
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
