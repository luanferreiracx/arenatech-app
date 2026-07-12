"use client";

import { useRouter } from "next/navigation";
import { ArrowUpDown } from "lucide-react";
import type { CatalogSort } from "@/server/services/public-catalog";
import { buildCatalogHref, SORT_OPTIONS } from "../_lib/catalog-href";

type CatalogResultsBarProps = {
  heading: string;
  total: number;
  search: string;
  activeCategoryId: string;
  sort: CatalogSort;
};

/**
 * Barra de resultados (sticky): título do recorte + contagem + ordenação. A
 * ordenação é um <select> nativo (acessível, sem lib de dropdown), que navega
 * na troca preservando busca/categoria.
 */
export function CatalogResultsBar({ heading, total, search, activeCategoryId, sort }: CatalogResultsBarProps) {
  const router = useRouter();

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--cat-line)] bg-[var(--cat-bg)]/85 px-4 py-3.5 backdrop-blur sm:px-6 lg:px-7">
      <div className="min-w-0">
        <h1 className="font-display truncate text-lg font-bold leading-tight text-[var(--cat-ink)] sm:text-xl">
          {heading}
        </h1>
        <p className="truncate text-[13px] text-[var(--cat-ink-soft)]">
          <span className="font-numeric font-semibold text-[var(--cat-ink)]">{total}</span>{" "}
          {total === 1 ? "produto" : "produtos"}
        </p>
      </div>

      <label className="relative flex shrink-0 items-center">
        <ArrowUpDown className="pointer-events-none absolute left-3 size-3.5 text-[var(--cat-ink-faint)]" />
        <span className="sr-only">Ordenar por</span>
        <select
          value={sort}
          onChange={(e) =>
            router.push(buildCatalogHref({ search, categoryId: activeCategoryId, sort: e.target.value as CatalogSort }))
          }
          className="font-body h-9 cursor-pointer appearance-none rounded-lg border border-[var(--cat-line)] bg-[var(--cat-surface)] pl-8 pr-8 text-sm font-medium text-[var(--cat-ink)] outline-none transition hover:border-[var(--cat-line-strong)] focus:border-[var(--cat-accent)]/50 focus:ring-2 focus:ring-[var(--cat-accent)]/15"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-2.5 size-3.5 text-[var(--cat-ink-faint)]" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </label>
    </div>
  );
}
