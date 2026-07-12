import Link from "next/link";
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
      <article className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--cat-line)] bg-[var(--cat-surface)] transition duration-150 group-hover:border-[var(--cat-line-strong)] group-hover:shadow-[0_8px_24px_-14px_oklch(0.5_0.02_260/0.35)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--cat-accent)]/40">
        {/* Foto contida num fundo claro: produtos com fundo preto respiram. */}
        <div className="relative aspect-square overflow-hidden bg-[var(--cat-surface-sunken)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="size-full object-contain p-3.5 transition duration-500 ease-out group-hover:scale-[1.04]"
          />

          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {product.discountPercent ? (
              <span className="font-numeric rounded-md bg-[var(--cat-accent)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--cat-accent-ink)]">
                −{product.discountPercent}%
              </span>
            ) : null}
            {product.lowStock ? (
              <span className="rounded-md border border-[var(--cat-line-strong)] bg-[var(--cat-surface)]/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--cat-ink-soft)] backdrop-blur">
                {product.availableQuantity === 1 ? "Último" : `Restam ${product.availableQuantity}`}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-3">
          <h3 className="font-body line-clamp-2 min-h-[2.25rem] text-[13px] font-normal leading-snug text-[var(--cat-ink)]">
            {product.name}
          </h3>

          <div className="mt-auto pt-2.5">
            {hasPrice ? (
              <>
                {product.promotionalPriceCents ? (
                  <p className="font-numeric text-[11px] text-[var(--cat-ink-faint)] line-through">
                    {formatCurrency(product.salePriceCents)}
                  </p>
                ) : null}
                <div className="flex items-baseline gap-1">
                  <span className="font-numeric text-lg font-bold tracking-tight text-[var(--cat-ink)]">
                    {formatCurrency(product.pixPriceCents)}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--cat-accent)]">Pix</span>
                </div>
                <p className="mt-0.5 text-[10px] text-[var(--cat-ink-soft)]">
                  <span className="font-numeric">6×</span> de{" "}
                  <span className="font-numeric">{formatCurrency(product.installmentCents)}</span>
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-[var(--cat-ink-soft)]">Consulte o preço</p>
            )}
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
