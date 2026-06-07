import { Suspense } from "react";
import { Camera, PackageCheck, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicCatalog } from "@/server/services/public-catalog";
import { CatalogFilters } from "./_components/catalog-filters";
import { CatalogList } from "./_components/catalog-list";

export const metadata = {
  title: "Catálogo | Arena Tech",
  description: "Produtos com foto disponíveis na Arena Tech.",
};

type CatalogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const catalog = await getPublicCatalog({
    search: readParam(params.q),
    categoryId: readParam(params.categoria),
    sort: readParam(params.ordem),
    page: readIntParam(params.page),
  });

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="absolute inset-x-0 top-0 -z-0 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(201,168,76,0.22),transparent_32%),radial-gradient(circle_at_top_right,rgba(120,89,20,0.16),transparent_30%)]" />
      <section className="relative mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        <div className="overflow-hidden rounded-[2rem] border border-primary/20 bg-zinc-950/80 p-6 shadow-[0_28px_100px_rgba(0,0,0,0.55)] backdrop-blur md:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Catálogo público
              </div>
              <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
                Produtos com foto, preço claro e disponibilidade real.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
                Acessórios, periféricos e itens selecionados da Arena Tech. O catálogo mostra somente produtos com foto e estoque disponível.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <HeroStat icon={Camera} label="com foto" value={catalog.totalAvailable} />
                <HeroStat icon={PackageCheck} label="nesta busca" value={catalog.total} />
                <HeroStat icon={ShieldCheck} label="Pix à vista" value="5% off" />
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-black">
                  <Search className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-white">Busca inteligente</p>
                  <p className="text-sm text-zinc-400">Ex.: “fonte iPhone”, “película Samsung”, “cabo tipo-c”.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto grid max-w-7xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[280px_1fr] lg:px-8">
        <CatalogFilters
          categories={catalog.categories}
          activeCategoryId={catalog.categoryId}
          search={catalog.search}
          sort={catalog.sort}
          totalAvailable={catalog.totalAvailable}
        />
        <div>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary/80">
                {catalog.search ? `Resultados para “${catalog.search}”` : "Produtos disponíveis"}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-white">{catalog.total} produto(s) com foto</h2>
            </div>
            <p className="text-sm text-zinc-400">
              Página {catalog.page} de {catalog.pageCount}
            </p>
          </div>
          <Suspense fallback={<CatalogFallback />}>
            <CatalogList catalog={catalog} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

function HeroStat({ icon: Icon, label, value }: { icon: typeof Camera; label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
      <Icon className="mb-3 h-5 w-5 text-primary" />
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</p>
    </div>
  );
}

function CatalogFallback() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-96 rounded-2xl bg-zinc-900" />
      ))}
    </div>
  );
}

function readParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function readIntParam(value: string | string[] | undefined): number | undefined {
  const param = readParam(value);
  if (!param) return undefined;
  const parsed = Number.parseInt(param, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
