import Link from "next/link";
import { Search, X, MessageCircle } from "lucide-react";
import { Logo } from "@/components/branding/logo";
import type { CatalogCategory, CatalogSort, CatalogContact } from "@/server/services/public-catalog";
import { buildCatalogHref, buildWhatsAppHref } from "../_lib/catalog-href";

type CatalogSidebarProps = {
  search: string;
  categories: CatalogCategory[];
  activeCategoryId: string;
  sort: CatalogSort;
  totalAvailable: number;
  contact: CatalogContact;
};

/**
 * Navegação principal do catálogo: marca + busca + categorias verticais + CTA
 * WhatsApp. No desktop é uma coluna fixa à esquerda (estilo marketplace); no
 * mobile o conteúdo é reaproveitado dentro do drawer (ver CatalogShell).
 */
export function CatalogSidebar(props: CatalogSidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-[var(--cat-line)] bg-[var(--cat-surface)] lg:block">
      <div className="sticky top-0 flex h-screen flex-col">
        <SidebarContent {...props} />
      </div>
    </aside>
  );
}

/** Conteúdo interno da sidebar — compartilhado entre a coluna fixa e o drawer. */
export function SidebarContent({
  search,
  categories,
  activeCategoryId,
  sort,
  totalAvailable,
  contact,
}: CatalogSidebarProps) {
  const waHref = contact.whatsappNumber ? buildWhatsAppHref(contact.whatsappNumber, contact.storeName) : null;

  return (
    <>
      {/* Marca */}
      <div className="flex h-16 items-center gap-2 border-b border-[var(--cat-line)] px-5">
        <Link href="/catalog" className="flex min-w-0 items-center gap-2" aria-label="Início do catálogo">
          <Logo size="md" tenantLogoUrl={contact.logoUrl ?? undefined} />
        </Link>
      </div>

      {/* Busca */}
      <form action="/catalog" className="relative px-4 py-4">
        {activeCategoryId && <input type="hidden" name="categoria" value={activeCategoryId} />}
        {sort !== "nome" && <input type="hidden" name="ordem" value={sort} />}
        <Search className="pointer-events-none absolute left-7 top-1/2 size-4 -translate-y-1/2 text-[var(--cat-ink-faint)]" />
        <input
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Buscar produto…"
          aria-label="Buscar produto"
          className="font-body h-10 w-full rounded-lg border border-[var(--cat-line)] bg-[var(--cat-bg)] pl-9 pr-9 text-sm text-[var(--cat-ink)] outline-none transition placeholder:text-[var(--cat-ink-faint)] focus:border-[var(--cat-accent)]/50 focus:ring-2 focus:ring-[var(--cat-accent)]/15"
        />
        {search && (
          <Link
            href={buildCatalogHref({ categoryId: activeCategoryId, sort })}
            aria-label="Limpar busca"
            className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--cat-ink-faint)] transition hover:text-[var(--cat-ink)]"
          >
            <X className="size-4" />
          </Link>
        )}
      </form>

      {/* Categorias — lista vertical com contagem; ativo marcado por faixa de acento. */}
      <nav aria-label="Categorias" className="flex-1 overflow-y-auto pb-2">
        <p className="px-5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--cat-ink-faint)]">
          Categorias
        </p>
        <CategoryLink
          href={buildCatalogHref({ search, sort })}
          active={!activeCategoryId}
          label="Todos"
          count={totalAvailable}
        />
        {categories.map((category) => (
          <CategoryLink
            key={category.id}
            href={buildCatalogHref({ search, sort, categoryId: category.id })}
            active={activeCategoryId === category.id}
            label={category.name}
            count={category.count}
          />
        ))}
      </nav>

      {/* WhatsApp — CTA fixo no rodapé da sidebar. */}
      {waHref && (
        <div className="border-t border-[var(--cat-line)] p-4">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--cat-wa)] py-2.5 text-sm font-semibold text-[var(--cat-wa-ink)] transition-colors hover:bg-[var(--cat-wa-hover)]"
          >
            <MessageCircle className="size-4" />
            Falar no WhatsApp
          </a>
        </div>
      )}
    </>
  );
}

function CategoryLink({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  // Ativo = pílula preenchida com tinta do acento (sem side-stripe border, que é
  // banido). Contagem em pílula quando ativa, texto simples quando não.
  return (
    <div className="px-3">
      <Link
        href={href}
        aria-current={active ? "true" : undefined}
        className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition ${
          active
            ? "bg-[var(--cat-accent)] font-semibold text-[var(--cat-accent-ink)]"
            : "text-[var(--cat-ink-soft)] hover:bg-[var(--cat-surface-sunken)] hover:text-[var(--cat-ink)]"
        }`}
      >
        <span className="min-w-0 truncate">{label}</span>
        <span
          className={`font-numeric shrink-0 rounded-full px-1.5 text-[11px] tabular-nums ${
            active ? "bg-[var(--cat-accent-ink)]/20 text-[var(--cat-accent-ink)]" : "text-[var(--cat-ink-faint)]"
          }`}
        >
          {count}
        </span>
      </Link>
    </div>
  );
}
