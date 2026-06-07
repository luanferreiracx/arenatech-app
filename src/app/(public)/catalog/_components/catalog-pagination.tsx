import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CatalogSort } from "@/server/services/public-catalog";

type CatalogPaginationProps = {
  page: number;
  pageCount: number;
  search: string;
  categoryId: string;
  sort: CatalogSort;
};

export function CatalogPagination({ page, pageCount, search, categoryId, sort }: CatalogPaginationProps) {
  if (pageCount <= 1) return null;

  const start = Math.max(1, page - 2);
  const end = Math.min(pageCount, page + 2);
  const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Paginação do catálogo">
      <PageLink disabled={page <= 1} href={buildPageHref({ page: page - 1, search, categoryId, sort })} ariaLabel="Página anterior">
        <ChevronLeft className="h-4 w-4" />
      </PageLink>
      {pages.map((item) => (
        <PageLink key={item} href={buildPageHref({ page: item, search, categoryId, sort })} active={item === page}>
          {item}
        </PageLink>
      ))}
      <PageLink disabled={page >= pageCount} href={buildPageHref({ page: page + 1, search, categoryId, sort })} ariaLabel="Próxima página">
        <ChevronRight className="h-4 w-4" />
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
      <span className="flex h-10 min-w-10 items-center justify-center rounded-xl border border-white/5 text-zinc-600">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={`flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition ${
        active
          ? "border-primary bg-primary text-black"
          : "border-white/10 text-zinc-300 hover:border-primary/50 hover:text-primary"
      }`}
    >
      {children}
    </Link>
  );
}

function buildPageHref(input: { page: number; search: string; categoryId: string; sort: CatalogSort }): string {
  const params = new URLSearchParams();
  if (input.search) params.set("q", input.search);
  if (input.categoryId) params.set("categoria", input.categoryId);
  if (input.sort !== "nome") params.set("ordem", input.sort);
  if (input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return query ? `/catalog?${query}` : "/catalog";
}
