import Link from "next/link";
import { Search, X, MessageCircle } from "lucide-react";
import { Logo } from "@/components/branding/logo";
import type { CatalogCategory, CatalogSort, CatalogContact } from "@/server/services/public-catalog";
import { buildCatalogHref } from "../_lib/catalog-href";
import { buildWhatsAppHref } from "../_lib/catalog-href";

type CatalogHeaderProps = {
  search: string;
  categories: CatalogCategory[];
  activeCategoryId: string;
  sort: CatalogSort;
  totalAvailable: number;
  contact: CatalogContact;
};

export function CatalogHeader({ search, categories, activeCategoryId, sort, totalAvailable, contact }: CatalogHeaderProps) {
  const waHref = contact.whatsappNumber ? buildWhatsAppHref(contact.whatsappNumber, contact.storeName) : null;
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--cat-line)] bg-[var(--cat-surface)]/85 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 py-3 sm:py-4">
          <Link href="/catalog" className="min-w-0 shrink-0" aria-label="Início do catálogo">
            <Logo size="md" tenantLogoUrl={contact.logoUrl ?? undefined} />
          </Link>

          {/* Busca — campo grande e sempre visível */}
          <form action="/catalog" className="relative ml-auto w-full max-w-md">
            {activeCategoryId && <input type="hidden" name="categoria" value={activeCategoryId} />}
            {sort !== "nome" && <input type="hidden" name="ordem" value={sort} />}
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--cat-ink-faint)]" />
            <input
              name="q"
              type="search"
              defaultValue={search}
              placeholder="Buscar produto…"
              aria-label="Buscar produto"
              className="font-body h-11 w-full rounded-full border border-[var(--cat-line)] bg-[var(--cat-bg)] pl-10 pr-10 text-[15px] text-[var(--cat-ink)] outline-none transition placeholder:text-[var(--cat-ink-faint)] focus:border-[var(--cat-accent)]/50 focus:ring-2 focus:ring-[var(--cat-accent)]/15"
            />
            {search && (
              <Link
                href={buildCatalogHref({ categoryId: activeCategoryId, sort })}
                aria-label="Limpar busca"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--cat-ink-faint)] transition hover:text-[var(--cat-ink)]"
              >
                <X className="size-4" />
              </Link>
            )}
          </form>

          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden shrink-0 items-center gap-2 rounded-full bg-[var(--cat-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--cat-accent-ink)] transition-colors hover:bg-[var(--cat-accent-hover)] sm:flex"
            >
              <MessageCircle className="size-4" />
              <span className="whitespace-nowrap">WhatsApp</span>
            </a>
          )}
        </div>

        {/* Chips de categoria — scroll horizontal no mobile */}
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
          ? "border-[var(--cat-ink)] bg-[var(--cat-ink)] text-[var(--cat-bg)]"
          : "border-[var(--cat-line)] bg-[var(--cat-surface)] text-[var(--cat-ink-soft)] hover:border-[var(--cat-line-strong)] hover:text-[var(--cat-ink)]"
      }`}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span className={`font-numeric text-[11px] ${active ? "text-[var(--cat-bg)]/70" : "text-[var(--cat-ink-faint)]"}`}>{count}</span>
    </Link>
  );
}
