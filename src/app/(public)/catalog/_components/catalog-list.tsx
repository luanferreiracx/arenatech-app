import Link from "next/link";
import { PackageSearch } from "lucide-react";
import type { PublicCatalogResult } from "@/server/services/public-catalog";
import { CatalogProductCard } from "./catalog-product-card";
import { CatalogPagination } from "./catalog-pagination";

type CatalogListProps = {
  catalog: PublicCatalogResult;
};

export function CatalogList({ catalog }: CatalogListProps) {
  if (catalog.products.length === 0) {
    return (
      <div className="catalog-rise card-sheen mx-auto max-w-md rounded-3xl p-10 text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--gold)]/12">
          <PackageSearch className="size-7 text-[var(--gold)]" />
        </span>
        <h2 className="font-display text-xl font-semibold text-white">Nada por aqui ainda</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-zinc-400">
          Não encontramos produtos com esses filtros. Tente outro termo ou veja tudo que está disponível.
        </p>
        <Link
          href="/catalog"
          className="mt-5 inline-flex items-center justify-center rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--gold-soft)]"
        >
          Ver todo o catálogo
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {catalog.products.map((product, index) => (
          <CatalogProductCard key={product.id} product={product} index={index} />
        ))}
      </div>
      <CatalogPagination
        page={catalog.page}
        pageCount={catalog.pageCount}
        search={catalog.search}
        categoryId={catalog.categoryId}
        sort={catalog.sort}
      />
    </>
  );
}
