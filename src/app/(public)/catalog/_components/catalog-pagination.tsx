import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CatalogSort } from "@/server/services/public-catalog";
import { buildCatalogHref } from "../_lib/catalog-href";

type CatalogPaginationProps = {
  page: number;
  pageCount: number;
  search: string;
  categoryId: string;
  sort: CatalogSort;
};

export function CatalogPagination({ page, pageCount, search, categoryId, sort }: CatalogPaginationProps) {
  if (pageCount <= 1) return null;

  const start = Math.max(1, page - 1);
  const end = Math.min(pageCount, start + 2);
  const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Paginação do catálogo">
      <PageLink
        disabled={page <= 1}
        href={buildCatalogHref({ page: page - 1, search, categoryId, sort })}
        ariaLabel="Página anterior"
      >
        <ChevronLeft className="size-4" />
      </PageLink>
      {pages.map((item) => (
        <PageLink key={item} href={buildCatalogHref({ page: item, search, categoryId, sort })} active={item === page}>
          {item}
        </PageLink>
      ))}
      <PageLink
        disabled={page >= pageCount}
        href={buildCatalogHref({ page: page + 1, search, categoryId, sort })}
        ariaLabel="Próxima página"
      >
        <ChevronRight className="size-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  active = false,
  disabled = false,
  ariaLabel,
  children,
}: {
  href: string;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="flex size-10 items-center justify-center rounded-xl border border-white/5 text-zinc-700">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={`font-numeric flex size-10 items-center justify-center rounded-xl border text-sm font-semibold transition ${
        active
          ? "border-[var(--cat-accent)] bg-[var(--cat-accent)] text-[var(--cat-bg)]"
          : "border-[var(--cat-line)] text-zinc-300 hover:border-[var(--cat-accent)]/50 hover:text-[var(--cat-accent-hover)]"
      }`}
    >
      {children}
    </Link>
  );
}
