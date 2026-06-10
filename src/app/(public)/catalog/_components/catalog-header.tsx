import Link from "next/link";
import { Search, X } from "lucide-react";
import { Logo } from "@/components/branding/logo";
import type { CatalogCategory, CatalogSort } from "@/server/services/public-catalog";
import { buildCatalogHref } from "../_lib/catalog-href";

type CatalogHeaderProps = {
  search: string;
  categories: CatalogCategory[];
  activeCategoryId: string;
  sort: CatalogSort;
  totalAvailable: number;
};

export function CatalogHeader({ search, categories, activeCategoryId, sort, totalAvailable }: CatalogHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[var(--ink)]/85 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 py-3 sm:py-4">
          <Link href="/catalog" className="shrink-0" aria-label="Início do catálogo">
            <Logo size="md" className="opacity-95" />
          </Link>

          {/* Busca — campo grande e sempre visível (correção mobile principal) */}
          <form action="/catalog" className="relative ml-auto w-full max-w-md">
            {activeCategoryId && <input type="hidden" name="categoria" value={activeCategoryId} />}
            {sort !== "nome" && <input type="hidden" name="ordem" value={sort} />}
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <input
              name="q"
              type="search"
              defaultValue={search}
              placeholder="Buscar produto…"
              aria-label="Buscar produto"
              className="font-body h-11 w-full rounded-full border border-white/10 bg-white/[0.04] pl-10 pr-10 text-[15px] text-white outline-none transition placeholder:text-zinc-500 focus:border-[var(--gold)]/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-[var(--gold)]/20"
            />
            {search && (
              <Link
                href={buildCatalogHref({ categoryId: activeCategoryId, sort })}
                aria-label="Limpar busca"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-500 transition hover:text-white"
              >
                <X className="size-4" />
              </Link>
            )}
          </form>
        </div>

        {/* Chips de categoria — scroll horizontal com snap no mobile */}
        <nav
          aria-label="Categorias"
          className="chip-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0"
        >
          <CategoryChip
            href={buildCatalogHref({ search, sort })}
            active={!activeCategoryId}
            label="Todos"
            count={totalAvailable}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              href={buildCatalogHref({ search, sort, categoryId: category.id })}
              active={activeCategoryId === category.id}
              label={category.name}
              count={category.count}
            />
          ))}
        </nav>
      </div>
    </header>
  );
}

function CategoryChip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? "border-[var(--gold)]/60 bg-[var(--gold)]/12 text-[var(--gold-soft)]"
          : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-white"
      }`}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span className={`font-numeric text-[11px] ${active ? "text-[var(--gold)]/70" : "text-zinc-600"}`}>{count}</span>
    </Link>
  );
}
