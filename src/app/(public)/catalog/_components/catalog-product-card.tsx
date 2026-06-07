import Link from "next/link";
import { ArrowUpRight, Package, Sparkles } from "lucide-react";
import type { CatalogProduct } from "@/server/services/public-catalog";

export function CatalogProductCard({ product }: { product: CatalogProduct }) {
  return (
    <Link href={`/catalog/${product.id}`} className="group block h-full">
      <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] transition duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white/[0.05]">
        <div className="relative aspect-square overflow-hidden bg-zinc-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/50 via-transparent to-transparent opacity-70" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {product.discountPercent && (
              <span className="rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white shadow-lg">
                -{product.discountPercent}%
              </span>
            )}
            {product.lowStock && (
              <span className="rounded-full bg-amber-400 px-2.5 py-1 text-xs font-bold text-black shadow-lg">
                {product.availableQuantity === 1 ? "Último" : `Restam ${product.availableQuantity}`}
              </span>
            )}
          </div>
          <div className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/60 text-primary opacity-0 backdrop-blur transition group-hover:opacity-100">
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              {product.brand ?? product.categoryName ?? "Arena Tech"}
            </span>
            {product.categoryName && (
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-zinc-400">
                {product.categoryName}
              </span>
            )}
          </div>

          <h3 className="line-clamp-2 min-h-11 text-[15px] font-medium leading-snug text-zinc-100">
            {product.name}
          </h3>

          <div className="mt-auto pt-5">
            {product.salePriceCents > 0 ? (
              <div className="space-y-1">
                {product.promotionalPriceCents && (
                  <p className="text-xs text-zinc-500 line-through">{formatCurrency(product.salePriceCents)}</p>
                )}
                <div className="flex items-center gap-2">
                  <p className="text-lg font-black tracking-tight text-primary">{formatCurrency(product.pixPriceCents)}</p>
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                    <Sparkles className="h-3 w-3" /> Pix
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  ou {formatCurrency(product.currentPriceCents)} em até 6x de {formatCurrency(product.installmentCents)}
                </p>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Package className="h-4 w-4" /> Consulte o preço
              </p>
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
