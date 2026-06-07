import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogCategory, CatalogSort } from "@/server/services/public-catalog";

type CatalogFiltersProps = {
  categories: CatalogCategory[];
  activeCategoryId: string;
  search: string;
  sort: CatalogSort;
  totalAvailable: number;
};

const SORT_OPTIONS: Array<{ value: CatalogSort; label: string }> = [
  { value: "nome", label: "A-Z" },
  { value: "preco_asc", label: "Menor preço" },
  { value: "preco_desc", label: "Maior preço" },
  { value: "recentes", label: "Mais recentes" },
];

export function CatalogFilters({ categories, activeCategoryId, search, sort, totalAvailable }: CatalogFiltersProps) {
  return (
    <aside className="space-y-6 lg:sticky lg:top-6">
      <form action="/catalog" className="space-y-3">
        <input type="hidden" name="categoria" value={activeCategoryId} />
        <input type="hidden" name="ordem" value={sort} />
        <label className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500" htmlFor="catalog-search">
          Buscar
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            id="catalog-search"
            name="q"
            defaultValue={search}
            placeholder="iPhone, fonte, película..."
            className="h-11 rounded-full border-white/10 bg-white/[0.03] pl-9 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-primary/40"
          />
        </div>
        <Button className="h-10 w-full rounded-full" type="submit">Buscar produto</Button>
        {(search || activeCategoryId || sort !== "nome") && (
          <Button className="h-10 w-full rounded-full text-zinc-400" variant="ghost" asChild>
            <Link href="/catalog">Limpar filtros</Link>
          </Button>
        )}
      </form>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Categorias</p>
        <nav className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
          <CategoryLink
            href={buildCatalogHref({ search, sort })}
            active={!activeCategoryId}
            name="Todos"
            count={totalAvailable}
          />
          {categories.map((category) => (
            <CategoryLink
              key={category.id}
              href={buildCatalogHref({ search, sort, categoryId: category.id })}
              active={activeCategoryId === category.id}
              name={category.name}
              count={category.count}
            />
          ))}
        </nav>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Ordenar</p>
        <div className="flex flex-wrap gap-2 lg:grid">
          {SORT_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={buildCatalogHref({ search, categoryId: activeCategoryId, sort: option.value })}
              className={`rounded-full border px-3 py-2 text-sm transition ${
                sort === option.value
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-white/10 text-zinc-400 hover:border-primary/40 hover:text-zinc-100"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}

function CategoryLink({ href, active, name, count }: { href: string; active: boolean; name: string; count: number }) {
  return (
    <Link
      href={href}
      className={`flex shrink-0 items-center justify-between rounded-full border px-3 py-2 text-sm transition lg:w-full ${
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-white/10 text-zinc-400 hover:border-primary/40 hover:text-zinc-100"
      }`}
    >
      <span className="truncate">{name}</span>
      <span className="ml-2 text-xs text-zinc-500">{count}</span>
    </Link>
  );
}

function buildCatalogHref(input: { search?: string; categoryId?: string; sort?: CatalogSort }): string {
  const params = new URLSearchParams();
  if (input.search) params.set("q", input.search);
  if (input.categoryId) params.set("categoria", input.categoryId);
  if (input.sort && input.sort !== "nome") params.set("ordem", input.sort);
  const query = params.toString();
  return query ? `/catalog?${query}` : "/catalog";
}
