"use client";

import Link from "next/link";
import { ArrowUpDown, Check, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { CatalogCategory, CatalogSort } from "@/server/services/public-catalog";
import { buildCatalogHref, DEFAULT_SORT_OPTION, SORT_OPTIONS } from "../_lib/catalog-href";

type CatalogToolbarProps = {
  search: string;
  categories: CatalogCategory[];
  activeCategoryId: string;
  sort: CatalogSort;
};

export function CatalogToolbar({ search, categories, activeCategoryId, sort }: CatalogToolbarProps) {
  const [open, setOpen] = useState(false);
  const activeSort = SORT_OPTIONS.find((option) => option.value === sort) ?? DEFAULT_SORT_OPTION;
  const hasFilters = Boolean(search || activeCategoryId || sort !== "nome");

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Mobile: abre bottom sheet com ordenação e categorias */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          className="font-body inline-flex items-center gap-2 rounded-full border border-white/12 bg-[var(--cat-bg)] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-[var(--cat-line-strong)] lg:hidden"
        >
          <SlidersHorizontal className="size-4" />
          Filtrar e ordenar
        </SheetTrigger>
        <SheetContent side="bottom" className="catalog-scope dark rounded-t-3xl border-[var(--cat-line)] bg-[var(--cat-surface-sunken)] text-[var(--cat-ink)]">
          <SheetHeader>
            <SheetTitle className="font-display text-lg text-[var(--cat-ink)]">Filtrar e ordenar</SheetTitle>
          </SheetHeader>

          <div className="max-h-[70vh] overflow-y-auto px-4 pb-8">
            <p className="mb-2 mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cat-ink-faint)]">Ordenar por</p>
            <div className="grid grid-cols-2 gap-2">
              {SORT_OPTIONS.map((option) => (
                <SheetClose key={option.value} asChild>
                  <Link
                    href={buildCatalogHref({ search, categoryId: activeCategoryId, sort: option.value })}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition ${
                      sort === option.value
                        ? "border-[var(--cat-accent)]/60 bg-[var(--cat-accent)]/12 text-[var(--cat-accent-hover)]"
                        : "border-[var(--cat-line)] text-zinc-300"
                    }`}
                  >
                    {option.label}
                    {sort === option.value && <Check className="size-4" />}
                  </Link>
                </SheetClose>
              ))}
            </div>

            <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--cat-ink-faint)]">Categorias</p>
            <div className="grid grid-cols-2 gap-2">
              <SheetClose asChild>
                <CategoryRow href={buildCatalogHref({ search, sort })} active={!activeCategoryId} label="Todos" />
              </SheetClose>
              {categories.map((category) => (
                <SheetClose key={category.id} asChild>
                  <CategoryRow
                    href={buildCatalogHref({ search, sort, categoryId: category.id })}
                    active={activeCategoryId === category.id}
                    label={category.name}
                    count={category.count}
                  />
                </SheetClose>
              ))}
            </div>

            {hasFilters && (
              <SheetClose asChild>
                <Link
                  href="/catalog"
                  className="mt-6 flex w-full items-center justify-center rounded-2xl border border-[var(--cat-line)] py-3 text-sm font-medium text-[var(--cat-ink-soft)] transition hover:text-[var(--cat-ink)]"
                >
                  Limpar filtros
                </Link>
              </SheetClose>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop: ordenação inline */}
      <div className="hidden items-center gap-2 lg:flex">
        <span className="mr-1 text-sm text-[var(--cat-ink-faint)]">Ordenar:</span>
        {SORT_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={buildCatalogHref({ search, categoryId: activeCategoryId, sort: option.value })}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
              sort === option.value
                ? "border-[var(--cat-accent)]/60 bg-[var(--cat-accent)]/12 text-[var(--cat-accent-hover)]"
                : "border-[var(--cat-line)] text-[var(--cat-ink-soft)] hover:border-[var(--cat-line-strong)] hover:text-[var(--cat-ink)]"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {/* Resumo da ordenação no mobile + limpar */}
      <div className="flex items-center gap-3 lg:hidden">
        <span className="font-body inline-flex items-center gap-1.5 text-xs text-[var(--cat-ink-faint)]">
          <ArrowUpDown className="size-3.5" />
          {activeSort.label}
        </span>
      </div>

      {hasFilters && (
        <Link
          href="/catalog"
          className="hidden text-sm text-[var(--cat-ink-faint)] transition hover:text-[var(--cat-ink)] lg:inline"
        >
          Limpar
        </Link>
      )}
    </div>
  );
}

function CategoryRow({ href, active, label, count }: { href: string; active: boolean; label: string; count?: number }) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm transition ${
        active ? "border-[var(--cat-accent)]/60 bg-[var(--cat-accent)]/12 text-[var(--cat-accent-hover)]" : "border-[var(--cat-line)] text-zinc-300"
      }`}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && <span className="font-numeric ml-2 text-xs text-[var(--cat-ink-faint)]">{count}</span>}
    </Link>
  );
}
