import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft, MapPin, MessageCircle, Package, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/branding/logo";
import {
  getPublicCatalogContact,
  getPublicCatalogProduct,
  getRelatedCatalogProducts,
} from "@/server/services/public-catalog";
import { CatalogProductCard, formatCurrency } from "../_components/catalog-product-card";
import { ProductGallery } from "../_components/product-gallery";

export const metadata = {
  title: "Produto | Arena Tech",
};

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const tenantSlug = (await headers()).get("x-catalog-tenant-slug") ?? undefined;
  const product = await getPublicCatalogProduct(id, tenantSlug);

  if (!product || !product.inStock || product.images.length === 0) {
    notFound();
  }

  const [related, contact] = await Promise.all([
    getRelatedCatalogProducts(product, tenantSlug),
    getPublicCatalogContact(tenantSlug),
  ]);
  const whatsappHref = buildWhatsAppHref(contact.whatsappNumber, contact.storeName, product.name, product.currentPriceCents);
  const hasPrice = product.salePriceCents > 0;

  return (
    <main className="relative min-h-screen overflow-x-hidden pb-24 lg:pb-12">
      <div className="catalog-atmosphere" aria-hidden />
      <div className="catalog-grain" aria-hidden />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[var(--ink)]/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/catalog" aria-label="Início do catálogo">
            <Logo size="md" className="opacity-95" />
          </Link>
          <Link
            href="/catalog"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-sm text-zinc-300 transition hover:border-white/25 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Catálogo
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <ProductGallery images={product.images} productName={product.name} fallbackUrl={product.mediumImageUrl} />

          <div className="catalog-rise lg:sticky lg:top-24" style={{ animationDelay: "80ms" }}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {product.categoryName && (
                <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  {product.categoryName}
                </span>
              )}
              {product.discountPercent ? (
                <span className="font-numeric rounded-full bg-[var(--gold)] px-2.5 py-1 text-[11px] font-bold text-black">
                  −{product.discountPercent}%
                </span>
              ) : null}
              {product.lowStock ? (
                <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                  {product.availableQuantity === 1 ? "Último disponível" : `Restam ${product.availableQuantity}`}
                </span>
              ) : null}
            </div>

            {product.brand && (
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{product.brand}</p>
            )}
            <h1 className="font-display mt-1.5 text-3xl font-semibold leading-tight text-white sm:text-4xl">
              {product.name}
            </h1>

            <div className="card-sheen mt-5 rounded-3xl p-5">
              {hasPrice ? (
                <>
                  {product.promotionalPriceCents ? (
                    <p className="font-numeric text-sm text-zinc-500 line-through">
                      {formatCurrency(product.salePriceCents)}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-end gap-2.5">
                    <span className="font-numeric text-4xl font-bold tracking-tight text-white">
                      {formatCurrency(product.pixPriceCents)}
                    </span>
                    <span className="mb-1.5 rounded-lg bg-[var(--gold)]/15 px-2 py-1 text-xs font-bold text-[var(--gold-soft)]">
                      5% off no Pix
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">
                    ou <span className="font-numeric">{formatCurrency(product.currentPriceCents)}</span> em até{" "}
                    <span className="font-numeric">6×</span> de{" "}
                    <span className="font-numeric text-white">{formatCurrency(product.installmentCents)}</span> sem juros
                  </p>
                </>
              ) : (
                <p className="text-xl font-bold text-[var(--gold-soft)]">Consulte o preço</p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <Benefit icon={Package} title="Disponível" text={`${product.availableQuantity} un.`} />
              <Benefit icon={MapPin} title="Retirada" text="Na loja" />
              <Benefit icon={ShieldCheck} title="Garantia" text="Suporte local" />
            </div>

            {/* CTA desktop (no mobile vira barra fixa no rodapé) */}
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="mt-5 hidden w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-3.5 text-base font-semibold text-black transition hover:bg-[#20bd5a] lg:flex"
            >
              <MessageCircle className="size-5" />
              Falar no WhatsApp
            </a>

            {product.description && (
              <div className="mt-6 border-t border-white/10 pt-5">
                <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Descrição
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{product.description}</p>
              </div>
            )}
          </div>
        </section>

        {related.length > 0 && (
          <section className="mt-14">
            <div className="mb-5 flex items-center gap-2">
              <Sparkles className="size-5 text-[var(--gold)]" />
              <h2 className="font-display text-2xl font-semibold text-white">Você também pode gostar</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {related.slice(0, 4).map((item, index) => (
                <CatalogProductCard key={item.id} product={item} index={index} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* CTA fixo no mobile — sempre acessível */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[var(--ink)]/90 p-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          {hasPrice && (
            <div className="shrink-0">
              <p className="font-numeric text-lg font-bold leading-none text-white">
                {formatCurrency(product.pixPriceCents)}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-[var(--gold)]">no Pix</p>
            </div>
          )}
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#25D366] py-3 text-base font-semibold text-black transition active:scale-[0.98]"
          >
            <MessageCircle className="size-5" />
            Falar no WhatsApp
          </a>
        </div>
      </div>
    </main>
  );
}

function Benefit({ icon: Icon, title, text }: { icon: typeof Package; title: string; text: string }) {
  return (
    <div className="card-sheen rounded-2xl p-3 text-center sm:text-left">
      <Icon className="mx-auto mb-1.5 size-4 text-[var(--gold)] sm:mx-0" />
      <p className="text-[13px] font-semibold text-white">{title}</p>
      <p className="text-[11px] text-zinc-500">{text}</p>
    </div>
  );
}

function buildWhatsAppHref(whatsappNumber: string, storeName: string, productName: string, priceCents: number): string {
  const message = `Olá, ${storeName}! Tenho interesse no produto: ${productName} (${formatCurrency(priceCents)}).`;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}
