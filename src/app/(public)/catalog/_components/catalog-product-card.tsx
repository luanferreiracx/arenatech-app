import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { CatalogProduct } from "@/server/services/public-catalog";

type CatalogProductCardProps = {
  product: CatalogProduct;
  /** Posição no grid — usada para o reveal escalonado na carga. */
  index?: number;
};

export function CatalogProductCard({ product, index = 0 }: CatalogProductCardProps) {
  const hasPrice = product.salePriceCents > 0;

  return (
    <Link
      href={`/catalog/${product.id}`}
      className="catalog-rise group block h-full focus:outline-none"
      style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}
    >
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--cat-line)] bg-[var(--cat-surface)] transition duration-200 group-hover:-translate-y-0.5 group-hover:border-[var(--cat-line-strong)] group-hover:shadow-[0_16px_40px_-20px_oklch(0.5_0.02_260/0.3)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--cat-accent)]/40">
        {/* Foto contida num fundo claro: produtos com fundo preto respiram. */}
        <div className="relative aspect-square overflow-hidden bg-[var(--cat-surface-sunken)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="size-full object-contain p-4 transition duration-500 ease-out group-hover:scale-[1.04]"
          />

          <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
            {product.discountPercent ? (
              <span className="font-numeric rounded-full bg-[var(--cat-accent)] px-2 py-0.5 text-[11px] font-bold text-[var(--cat-accent-ink)]">
                −{product.discountPercent}%
              </span>
            ) : null}
            {product.lowStock ? (
              <span className="rounded-full border border-[var(--cat-line-strong)] bg-[var(--cat-surface)]/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--cat-ink-soft)] backdrop-blur">
                {product.availableQuantity === 1 ? "Último" : `Restam ${product.availableQuantity}`}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cat-ink-faint)]">
            {product.brand ?? product.categoryName ?? "Produto"}
          </p>
          <h3 className="font-body mt-1 line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-[var(--cat-ink)]">
            {product.name}
          </h3>

          <div className="mt-auto pt-3">
            {hasPrice ? (
              <>
                {product.promotionalPriceCents ? (
                  <p className="font-numeric text-xs text-[var(--cat-ink-faint)] line-through">
                    {formatCurrency(product.salePriceCents)}
                  </p>
                ) : null}
                <div className="flex items-baseline gap-1.5">
                  <span className="font-numeric text-xl font-bold tracking-tight text-[var(--cat-ink)]">
                    {formatCurrency(product.pixPriceCents)}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cat-accent)]">Pix</span>
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--cat-ink-soft)]">
                  ou <span className="font-numeric">6×</span> de{" "}
                  <span className="font-numeric">{formatCurrency(product.installmentCents)}</span>
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-[var(--cat-ink-soft)]">Consulte o preço</p>
            )}
            <span className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--cat-ink)] py-2 text-[13px] font-semibold text-[var(--cat-bg)] transition-colors group-hover:bg-[var(--cat-accent)] group-hover:text-[var(--cat-accent-ink)]">
              Ver detalhes
              <ArrowUpRight className="size-3.5" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

export function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
