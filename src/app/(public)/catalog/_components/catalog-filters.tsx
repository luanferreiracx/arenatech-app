import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
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
    <aside className="space-y-4 lg:sticky lg:top-6">
      <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Search className="h-4 w-4 text-primary" />
          Buscar no catálogo
        </div>
        <form action="/catalog" className="space-y-3">
          <input type="hidden" name="categoria" value={activeCategoryId} />
          <input type="hidden" name="ordem" value={sort} />
          <Input
            name="q"
            defaultValue={search}
            placeholder="iPhone, fonte, película..."
            className="border-white/10 bg-black/60 text-zinc-100 placeholder:text-zinc-500"
          />
          <Button className="w-full" type="submit">Buscar</Button>
          {(search || activeCategoryId || sort !== "nome") && (
            <Button className="w-full" variant="ghost" asChild>
              <Link href="/catalog">Limpar filtros</Link>
            </Button>
          )}
        </form>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          Categorias
        </div>
        <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
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

      <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
        <div className="mb-3 text-sm font-semibold text-zinc-100">Ordenar</div>
        <div className="grid gap-2">
          {SORT_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={buildCatalogHref({ search, categoryId: activeCategoryId, sort: option.value })}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                sort === option.value
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-white/10 text-zinc-300 hover:border-primary/40 hover:text-primary"
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
      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
        active
          ? "border-primary/60 bg-primary/10 text-primary"
          : "border-white/10 text-zinc-300 hover:border-primary/40 hover:text-primary"
      }`}
    >
      <span className="truncate">{name}</span>
      <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-400">{count}</span>
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
