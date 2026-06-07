import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle, Package, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { Logo } from "@/components/branding/logo";
import { Button } from "@/components/ui/button";
import { getPublicCatalogProduct, getRelatedCatalogProducts } from "@/server/services/public-catalog";
import { CatalogProductCard, formatCurrency } from "../_components/catalog-product-card";

export const metadata = {
  title: "Produto | Arena Tech",
};

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

const WHATSAPP_NUMBER = "5586995647443";

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const product = await getPublicCatalogProduct(id);

  if (!product || !product.inStock || product.images.length === 0) {
    notFound();
  }

  const related = await getRelatedCatalogProducts(product);
  const whatsappHref = buildWhatsAppHref(product.name, product.currentPriceCents);

  return (
    <main className="min-h-screen bg-[#050505] text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(201,165,92,0.14),transparent_44%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <Logo size="md" className="opacity-95" />
          <Button asChild variant="ghost" className="rounded-full text-zinc-400 hover:text-primary">
            <Link href="/catalog">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Catálogo
            </Link>
          </Button>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-start">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03]">
              <div className="aspect-square bg-zinc-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={product.mediumImageUrl} alt={product.name} className="h-full w-full object-cover" />
              </div>
            </div>
            {product.images.length > 1 && (
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                {product.images.slice(0, 6).map((image) => (
                  <div key={image.id} className="aspect-square overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.thumbUrl ?? image.mediumUrl ?? image.url} alt="Miniatura do produto" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 lg:sticky lg:top-8">
            <div className="mb-3 flex flex-wrap gap-2">
              {product.categoryName && (
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  {product.categoryName}
                </span>
              )}
              {product.lowStock && (
                <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-black">
                  {product.availableQuantity === 1 ? "Último disponível" : `Restam ${product.availableQuantity}`}
                </span>
              )}
              {product.discountPercent && (
                <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white">
                  -{product.discountPercent}%
                </span>
              )}
            </div>

            {product.brand && <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">{product.brand}</p>}
            <h1 className="mt-2 text-3xl font-black leading-tight text-white sm:text-4xl">{product.name}</h1>
            {product.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{product.description}</p>}

            <div className="mt-6 rounded-3xl border border-white/10 bg-black/30 p-5">
              {product.salePriceCents > 0 ? (
                <div>
                  {product.promotionalPriceCents && (
                    <p className="text-sm text-zinc-500 line-through">{formatCurrency(product.salePriceCents)}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-end gap-3">
                    <p className="text-4xl font-black tracking-tight text-primary">{formatCurrency(product.pixPriceCents)}</p>
                    <span className="mb-1 rounded-lg bg-primary/10 px-2 py-1 text-xs font-bold text-primary">5% off no Pix</span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">
                    ou {formatCurrency(product.currentPriceCents)} em até 6x de {formatCurrency(product.installmentCents)} sem juros
                  </p>
                </div>
              ) : (
                <p className="text-xl font-bold text-primary">Consulte o preço</p>
              )}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Benefit icon={Package} title="Disponível" text={`${product.availableQuantity} un.`} />
              <Benefit icon={Truck} title="Retirada" text="Loja Arena" />
              <Benefit icon={ShieldCheck} title="Garantia" text="Suporte local" />
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="flex-1 rounded-full bg-[#25D366] text-black hover:bg-[#20bd5a]">
                <a href={whatsappHref} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Chamar no WhatsApp
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-white/15 text-zinc-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary">
                <Link href="/catalog">Ver mais</Link>
              </Button>
            </div>
          </div>
        </section>

        {related.length > 0 && (
          <section className="mt-14">
            <div className="mb-5 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold text-white">Produtos relacionados</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((item) => (
                <CatalogProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Benefit({ icon: Icon, title, text }: { icon: typeof Package; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <Icon className="mb-2 h-4 w-4 text-primary" />
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-zinc-500">{text}</p>
    </div>
  );
}

function buildWhatsAppHref(productName: string, priceCents: number): string {
  const message = `Olá! Tenho interesse no produto: ${productName} (${formatCurrency(priceCents)})`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
