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
      <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center">
        <PackageSearch className="mx-auto mb-4 h-12 w-12 text-primary/70" />
        <h2 className="text-xl font-semibold text-zinc-100">Nenhum produto encontrado</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
          Tente buscar outro termo, trocar a categoria ou adicionar fotos aos produtos no estoque.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {catalog.products.map((product) => (
          <CatalogProductCard key={product.id} product={product} />
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
