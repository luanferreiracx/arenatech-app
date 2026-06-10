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
      style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
    >
      <article className="card-sheen flex h-full flex-col overflow-hidden rounded-3xl transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_24px_60px_-30px_rgba(201,165,92,0.45)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--gold)]/50">
        <div className="relative aspect-square overflow-hidden bg-[var(--ink)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="size-full object-cover transition duration-700 ease-out group-hover:scale-[1.06]"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/55 via-transparent to-transparent" />

          <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
            {product.discountPercent ? (
              <span className="font-numeric rounded-full bg-[var(--gold)] px-2 py-0.5 text-[11px] font-bold text-black shadow-lg">
                −{product.discountPercent}%
              </span>
            ) : null}
            {product.lowStock ? (
              <span className="rounded-full border border-white/20 bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300 backdrop-blur">
                {product.availableQuantity === 1 ? "Último" : `Restam ${product.availableQuantity}`}
              </span>
            ) : null}
          </div>

          <span className="absolute bottom-2.5 right-2.5 flex size-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-[var(--gold)] opacity-0 backdrop-blur transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 sm:translate-y-1">
            <ArrowUpRight className="size-4" />
          </span>
        </div>

        <div className="flex flex-1 flex-col p-3 sm:p-4">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--gold)]/75">
            {product.brand ?? product.categoryName ?? "Arena Tech"}
          </p>
          <h3 className="font-body mt-1 line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-zinc-100 sm:text-[15px]">
            {product.name}
          </h3>

          <div className="mt-auto pt-3">
            {hasPrice ? (
              <>
                {product.promotionalPriceCents ? (
                  <p className="font-numeric text-xs text-zinc-500 line-through">
                    {formatCurrency(product.salePriceCents)}
                  </p>
                ) : null}
                <div className="flex items-baseline gap-1.5">
                  <span className="font-numeric text-lg font-bold tracking-tight text-white sm:text-xl">
                    {formatCurrency(product.pixPriceCents)}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--gold)]">Pix</span>
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  ou <span className="font-numeric">6×</span> de{" "}
                  <span className="font-numeric">{formatCurrency(product.installmentCents)}</span>
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-[var(--gold-soft)]">Consulte o preço</p>
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
