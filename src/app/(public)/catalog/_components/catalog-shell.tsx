"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/branding/logo";
import type { CatalogCategory, CatalogSort, CatalogContact } from "@/server/services/public-catalog";
import { CatalogSidebar, SidebarContent } from "./catalog-sidebar";

type CatalogShellProps = {
  search: string;
  categories: CatalogCategory[];
  activeCategoryId: string;
  sort: CatalogSort;
  totalAvailable: number;
  contact: CatalogContact;
  children: React.ReactNode;
};

/**
 * Casca do catálogo: sidebar fixa à esquerda no desktop, drawer no mobile. O
 * conteúdo (barra de resultados + grid) fica no `children` à direita — donut
 * pattern (client shell envolvendo os Server Components do conteúdo).
 */
export function CatalogShell({ children, ...nav }: CatalogShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fecha o drawer ao navegar (o clique numa categoria troca a rota).
  useEffect(() => {
    if (!drawerOpen) return;
    const close = () => setDrawerOpen(false);
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen bg-[var(--cat-bg)]">
      {/* Desktop: sidebar fixa */}
      <CatalogSidebar {...nav} />

      {/* Mobile: drawer */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-[var(--cat-ink)]/40 lg:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-[var(--cat-surface)] shadow-xl lg:hidden">
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Fechar menu"
              className="absolute right-3 top-4 z-10 rounded-full p-1.5 text-[var(--cat-ink-soft)] hover:bg-[var(--cat-surface-sunken)]"
            >
              <X className="size-5" />
            </button>
            <SidebarContent {...nav} />
          </aside>
        </>
      )}

      {/* Conteúdo */}
      <div className="min-w-0 flex-1">
        {/* Topbar mobile: hambúrguer + marca (a sidebar some no mobile). */}
        <div className="flex h-14 items-center gap-3 border-b border-[var(--cat-line)] bg-[var(--cat-surface)] px-4 lg:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
            className="rounded-lg p-1.5 text-[var(--cat-ink)] hover:bg-[var(--cat-surface-sunken)]"
          >
            <Menu className="size-5" />
          </button>
          <Link href="/catalog" className="min-w-0" aria-label="Início do catálogo">
            <Logo size="sm" tenantLogoUrl={nav.contact.logoUrl ?? undefined} />
          </Link>
        </div>

        {children}
      </div>
    </div>
  );
}
