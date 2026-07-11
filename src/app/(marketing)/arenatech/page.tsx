import { unstable_noStore as noStore } from "next/cache";
import Image from "next/image";
import {
  MapPin,
  Clock,
  Star,
  ArrowUpRight,
  Phone,
  ShieldCheck,
  Store,
  Truck,
  BadgeCheck,
} from "lucide-react";

/* ============================================================
   Arena Tech — landing institucional (loja física, Teresina-PI)
   Marca de varejo: preto quente + ouro. Server Component estático.
   Foco: venda de produtos Apple e acessórios. Sem assistência técnica.
   ============================================================ */

const WHATSAPP_URL =
  "https://wa.me/5586995647443?text=Vim+pelo+site%2C+quero+saber+mais+sobre+os+produtos%21";
const PHONE_DISPLAY = "(86) 99564-7443";
const PHONE_URL = "tel:5586995647443";
const CATALOG_URL = "https://catalogo.arenatechpi.com.br";
const INSTAGRAM_URL = "https://instagram.com/arenatechpi";
const GOOGLE_URL = "https://share.google/nc04bpfKVFx967n3t";
const MAPS_LINK = "https://www.google.com/maps/search/?api=1&query=Arena+Tech+Riverside+Shopping+Teresina";

const APPLE_PRODUCTS = [
  {
    name: "iPhone",
    note: "Diversos modelos, com procedência",
    image: "/landing/arenatech/hero-iphone.jpg",
    alt: "iPhone preto com câmera dupla sobre superfície escura",
    span: "lg:row-span-2",
    ratio: "aspect-[3/4]",
  },
  {
    name: "MacBook",
    note: "Air e Pro",
    image: "/landing/arenatech/macbook-desk.jpg",
    alt: "MacBook aberto sobre mesa de madeira",
    span: "",
    ratio: "aspect-[4/3]",
  },
  {
    name: "iPad · Apple Watch · AirPods",
    note: "Linha completa para o dia a dia",
    image: "/landing/arenatech/macbook-logo.jpg",
    alt: "Logo da Apple gravado em alumínio escovado",
    span: "",
    ratio: "aspect-[4/3]",
  },
] as const;

const ACCESSORIES = [
  "Capas e cases",
  "Películas de vidro",
  "Fones bluetooth",
  "Caixas de som",
  "Smartwatches",
  "Carregadores turbo",
  "Suportes",
  "Acessórios gamer",
] as const;

const DIFFERENTIALS = [
  {
    icon: Store,
    title: "Loja física no Riverside",
    body: "Você vê, testa e leva na hora. Um espaço de verdade, não só um perfil de rede social.",
  },
  {
    icon: BadgeCheck,
    title: "Procedência garantida",
    body: "Produtos Apple selecionados, com garantia e nota. Sem surpresa depois da compra.",
  },
  {
    icon: Truck,
    title: "Pronta entrega",
    body: "Estoque na loja para sair com o seu no mesmo dia. Nada de espera nem pré-venda.",
  },
  {
    icon: ShieldCheck,
    title: "Atendimento que resolve",
    body: "Time que conhece o que vende e te ajuda a escolher o modelo certo pra você.",
  },
] as const;

const REVIEWS = [
  {
    name: "Marcos A.",
    text: "Melhor loja de Teresina pra produtos Apple. Atendimento excelente e preço justo.",
  },
  {
    name: "Priscila R.",
    text: "Comprei meu iPhone e saí com tudo configurado. Recomendo demais, gente séria.",
  },
  {
    name: "João V.",
    text: "Variedade enorme de acessórios e um pessoal que entende do assunto. Voltarei sempre.",
  },
] as const;

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": ["Store", "ElectronicsStore"],
  name: "Arena Tech",
  image: "https://arenatechpi.com.br/logo.png",
  "@id": "https://arenatechpi.com.br/#business",
  url: "https://arenatechpi.com.br",
  telephone: "+5586995647443",
  priceRange: "$$",
  description:
    "Loja de produtos Apple e acessórios em Teresina-PI. iPhone, iPad, MacBook, Apple Watch, AirPods e acessórios, no Riverside Shopping.",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Av. Ininga, 1201 - Riverside Shopping, Loja V-48",
    addressLocality: "Teresina",
    addressRegion: "PI",
    postalCode: "64049-490",
    addressCountry: "BR",
  },
  geo: { "@type": "GeoCoordinates", latitude: -5.0892, longitude: -42.8019 },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      opens: "09:00",
      closes: "21:00",
    },
  ],
  sameAs: ["https://www.instagram.com/arenatechpi"],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Produtos Arena Tech",
    itemListElement: [
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Product",
          name: "iPhone",
          brand: { "@type": "Brand", name: "Apple" },
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Product",
          name: "iPad",
          brand: { "@type": "Brand", name: "Apple" },
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Product",
          name: "MacBook",
          brand: { "@type": "Brand", name: "Apple" },
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Product",
          name: "Apple Watch",
          brand: { "@type": "Brand", name: "Apple" },
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Product",
          name: "AirPods",
          brand: { "@type": "Brand", name: "Apple" },
        },
      },
    ],
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "5.0",
    reviewCount: "100",
  },
};

function InstagramIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-[family-name:var(--font-at-display)] font-extrabold tracking-tight ${className}`}
    >
      Arena<span className="text-at-gold">Tech</span>
    </span>
  );
}

function GoldRule() {
  return (
    <span
      aria-hidden
      className="block h-px w-16 bg-linear-to-r from-at-gold to-transparent"
    />
  );
}

export default function ArenaTechLandingPage() {
  noStore();

  return (
    <div className="min-h-dvh bg-at-ink font-[family-name:var(--font-at-body)] text-at-cream antialiased">
      <script
        type="application/ld+json"
        // JSON.stringify de um literal fixo, sem entrada de usuário — seguro.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 border-b border-at-line/40 bg-at-ink/85 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <a href="#topo" className="flex items-center gap-2.5 min-w-0">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-at-gold/40 bg-at-gold/10 text-at-gold">
              <span className="font-[family-name:var(--font-at-display)] text-sm font-extrabold">
                A
              </span>
            </span>
            <Wordmark className="truncate text-lg" />
          </a>
          <div className="hidden items-center gap-8 text-sm text-at-mute md:flex">
            <a className="transition-colors hover:text-at-cream" href="#apple">
              Apple
            </a>
            <a
              className="transition-colors hover:text-at-cream"
              href="#acessorios"
            >
              Acessórios
            </a>
            <a className="transition-colors hover:text-at-cream" href="#loja">
              A loja
            </a>
            <a
              className="transition-colors hover:text-at-cream"
              href="#localizacao"
            >
              Onde estamos
            </a>
          </div>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-at-gold px-4 py-2 text-sm font-semibold text-at-ink transition-transform hover:scale-[1.03]"
          >
            <span className="hidden sm:inline">Falar no WhatsApp</span>
            <span className="sm:hidden">WhatsApp</span>
            <ArrowUpRight className="size-4" />
          </a>
        </nav>
      </header>

      {/* ── Hero (assimétrico) ── */}
      <section id="topo" className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 right-0 h-[520px] w-[520px] rounded-full bg-at-gold/10 blur-[130px]"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pt-16 pb-20 md:grid-cols-[1.05fr_0.95fr] md:pt-24 md:pb-28">
          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-at-line/60 bg-at-ink-raised/60 px-4 py-1.5 text-xs text-at-mute">
              <MapPin className="size-3.5 text-at-gold" />
              Riverside Shopping · Teresina, PI
            </div>
            <h1 className="font-[family-name:var(--font-at-display)] text-[clamp(2.4rem,7vw,4.25rem)] font-extrabold leading-[1.02] tracking-tight text-balance">
              A loja Apple de{" "}
              <span className="text-at-gold">Teresina</span> que você já
              conhece.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-at-mute text-pretty">
              iPhone, iPad, MacBook, Apple Watch e AirPods com procedência, mais
              uma vitrine completa de acessórios. Você escolhe na loja e sai com
              o seu na hora.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-at-gold px-6 py-3.5 font-semibold text-at-ink shadow-lg shadow-at-gold/20 transition-transform hover:scale-[1.02]"
              >
                Fazer um orçamento
                <ArrowUpRight className="size-4" />
              </a>
              <a
                href={CATALOG_URL}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-at-line px-6 py-3.5 font-medium text-at-cream transition-colors hover:border-at-gold/60 hover:text-at-gold"
              >
                Ver catálogo online
              </a>
            </div>

            <div className="mt-10 flex items-center gap-4">
              <div
                className="flex text-at-gold"
                aria-label="Avaliação 5 de 5 estrelas"
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="size-4 fill-current" />
                ))}
              </div>
              <p className="text-sm text-at-mute">
                <span className="font-semibold text-at-cream">5,0</span> no
                Google · loja bem avaliada em Teresina
              </p>
            </div>
          </div>

          {/* Imagem dominante do hero */}
          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-3 rounded-[2rem] bg-linear-to-br from-at-gold/25 to-transparent opacity-40 blur-2xl"
            />
            <div className="relative overflow-hidden rounded-[1.75rem] border border-at-line/60">
              <Image
                src="/landing/arenatech/hero-iphone.jpg"
                alt="iPhone preto com câmera dupla em destaque sobre fundo escuro"
                width={1200}
                height={1449}
                priority
                sizes="(max-width: 768px) 100vw, 45vw"
                className="h-full w-full object-cover"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-linear-to-t from-at-ink/70 via-transparent to-transparent"
              />
              <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-at-gold">
                    Em estoque
                  </p>
                  <p className="truncate font-[family-name:var(--font-at-display)] text-lg font-bold">
                    Linha iPhone
                  </p>
                </div>
                <span className="rounded-full border border-at-cream/20 bg-at-ink/60 px-3 py-1 text-xs text-at-cream backdrop-blur">
                  Apple
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Vitrine Apple ── */}
      <section id="apple" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-lg">
            <GoldRule />
            <h2 className="mt-4 font-[family-name:var(--font-at-display)] text-[clamp(1.9rem,4vw,2.75rem)] font-bold tracking-tight text-balance">
              Vendemos Apple em Teresina
            </h2>
            <p className="mt-3 text-at-mute text-pretty">
              A linha completa, com garantia e procedência. Venha ver os modelos
              disponíveis no Riverside Shopping.
            </p>
          </div>
          <a
            href={CATALOG_URL}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 self-start text-sm font-semibold text-at-gold transition-opacity hover:opacity-80 md:self-auto"
          >
            Ver catálogo completo
            <ArrowUpRight className="size-4" />
          </a>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 lg:grid-rows-2">
          {APPLE_PRODUCTS.map((product) => (
            <article
              key={product.name}
              className={`group relative overflow-hidden rounded-2xl border border-at-line/50 ${product.span}`}
            >
              <div className={`relative ${product.ratio}`}>
                <Image
                  src={product.image}
                  alt={product.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 45vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-linear-to-t from-at-ink via-at-ink/20 to-transparent"
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-5">
                <h3 className="font-[family-name:var(--font-at-display)] text-xl font-bold text-balance">
                  {product.name}
                </h3>
                <p className="mt-1 text-sm text-at-mute break-words">
                  {product.note}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Acessórios ── */}
      <section
        id="acessorios"
        className="border-y border-at-line/40 bg-at-ink-deep"
      >
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-12 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <div className="max-w-md">
              <GoldRule />
              <h2 className="mt-4 font-[family-name:var(--font-at-display)] text-[clamp(1.9rem,4vw,2.75rem)] font-bold tracking-tight text-balance">
                E tudo o que seu tech pede
              </h2>
              <p className="mt-3 text-at-mute text-pretty">
                Uma curadoria de acessórios premium para iPhone, notebook e o
                seu setup, a pronta entrega na loja.
              </p>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener"
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-at-gold/50 px-5 py-2.5 text-sm font-semibold text-at-gold transition-colors hover:bg-at-gold hover:text-at-ink"
              >
                Perguntar disponibilidade
                <ArrowUpRight className="size-4" />
              </a>
            </div>

            <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-at-line/50 bg-at-line/40 sm:grid-cols-2">
              {ACCESSORIES.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 bg-at-ink-raised px-5 py-5 text-sm font-medium text-at-cream"
                >
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-at-gold"
                  />
                  <span className="min-w-0 truncate">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Diferenciais ── */}
      <section id="loja" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 max-w-xl">
          <GoldRule />
          <h2 className="mt-4 font-[family-name:var(--font-at-display)] text-[clamp(1.9rem,4vw,2.75rem)] font-bold tracking-tight text-balance">
            Por que comprar na Arena Tech
          </h2>
        </div>
        <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2">
          {DIFFERENTIALS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-at-gold/25 bg-at-gold/10 text-at-gold">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-[family-name:var(--font-at-display)] text-lg font-bold text-balance">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-at-mute text-pretty">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Prova social ── */}
      <section className="border-y border-at-line/40 bg-at-ink-deep">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
            <div>
              <GoldRule />
              <h2 className="mt-4 font-[family-name:var(--font-at-display)] text-[clamp(1.7rem,3.5vw,2.4rem)] font-bold tracking-tight">
                Quem compra, volta
              </h2>
            </div>
            <a
              href={GOOGLE_URL}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 text-sm font-semibold text-at-gold transition-opacity hover:opacity-80"
            >
              Ver avaliações no Google
              <ArrowUpRight className="size-4" />
            </a>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {REVIEWS.map((review) => (
              <figure
                key={review.name}
                className="flex flex-col gap-4 rounded-2xl border border-at-line/50 bg-at-ink-raised p-6"
              >
                <div
                  className="flex text-at-gold"
                  aria-label="5 de 5 estrelas"
                >
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="size-4 fill-current" />
                  ))}
                </div>
                <blockquote className="text-sm leading-relaxed text-at-cream text-pretty">
                  {review.text}
                </blockquote>
                <figcaption className="mt-auto text-sm font-semibold text-at-mute">
                  {review.name}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Localização ── */}
      <section id="localizacao" className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-8 md:grid-cols-2 md:items-stretch">
          <div className="flex flex-col justify-center">
            <GoldRule />
            <h2 className="mt-4 font-[family-name:var(--font-at-display)] text-[clamp(1.9rem,4vw,2.75rem)] font-bold tracking-tight text-balance">
              Venha nos visitar
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-at-cream">
              Av. Ininga, 1201 — Riverside Shopping
              <br />
              <span className="text-at-mute">Loja V-48 · Teresina, PI</span>
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm text-at-mute">
              <Clock className="size-4 text-at-gold" />
              Segunda a sábado, das 9h às 21h
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-at-gold px-6 py-3.5 font-semibold text-at-ink transition-transform hover:scale-[1.02]"
              >
                Chamar no WhatsApp
                <ArrowUpRight className="size-4" />
              </a>
              <a
                href={PHONE_URL}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-at-line px-6 py-3.5 font-medium text-at-cream transition-colors hover:border-at-gold/60"
              >
                <Phone className="size-4 text-at-gold" />
                {PHONE_DISPLAY}
              </a>
            </div>
          </div>

          <a
            href={MAPS_LINK}
            target="_blank"
            rel="noopener"
            aria-label="Abrir a localização da Arena Tech no Google Maps"
            className="group relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-2xl border border-at-line/50 bg-at-ink-deep p-6"
          >
            {/* Malha de ruas estilizada (SVG), tom noturno + acento ouro */}
            <svg
              aria-hidden
              className="absolute inset-0 size-full text-at-line/60"
              preserveAspectRatio="xMidYMid slice"
              viewBox="0 0 400 320"
              fill="none"
            >
              <rect width="400" height="320" fill="var(--color-at-ink)" />
              <g stroke="currentColor" strokeWidth="1.5">
                <path d="M-20 90 L420 60" />
                <path d="M-20 180 L420 210" />
                <path d="M-20 260 L420 250" />
                <path d="M70 -20 L110 340" />
                <path d="M210 -20 L190 340" />
                <path d="M320 -20 L340 340" />
              </g>
              <g stroke="var(--color-at-gold)" strokeOpacity="0.35" strokeWidth="2">
                <path d="M-20 135 L420 150" />
                <path d="M150 -20 L165 340" />
              </g>
            </svg>
            <div
              aria-hidden
              className="absolute inset-0 bg-linear-to-t from-at-ink via-at-ink/50 to-transparent"
            />

            {/* Marcador */}
            <span className="relative mx-auto mt-8 flex size-14 items-center justify-center">
              <span className="absolute inline-flex size-14 animate-ping rounded-full bg-at-gold/30" />
              <span className="relative grid size-12 place-items-center rounded-full bg-at-gold text-at-ink shadow-lg shadow-at-gold/30">
                <MapPin className="size-6" />
              </span>
            </span>

            <div className="relative flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.2em] text-at-gold">
                  Riverside Shopping
                </p>
                <p className="truncate font-[family-name:var(--font-at-display)] text-lg font-bold">
                  Arena Tech · Loja V-48
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-at-cream/20 bg-at-ink/60 px-3 py-1.5 text-xs font-medium text-at-cream backdrop-blur transition-colors group-hover:border-at-gold/50 group-hover:text-at-gold">
                Abrir no mapa
                <ArrowUpRight className="size-3.5" />
              </span>
            </div>
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-at-line/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <Wordmark className="text-xl" />
            <div className="flex flex-wrap items-center gap-5 text-sm text-at-mute">
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-2 transition-colors hover:text-at-gold"
              >
                <InstagramIcon className="size-4" />
                @arenatechpi
              </a>
              <a
                href={GOOGLE_URL}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-2 transition-colors hover:text-at-gold"
              >
                <Star className="size-4" />
                Google
              </a>
              <a
                href={CATALOG_URL}
                target="_blank"
                rel="noopener"
                className="transition-colors hover:text-at-gold"
              >
                Catálogo
              </a>
            </div>
          </div>
          <div className="flex flex-col gap-1 border-t border-at-line/30 pt-6 text-xs text-at-faint">
            <p>Arena Tech · CNPJ 61.129.502/0001-01</p>
            <p>© 2026 Arena Tech · Todos os direitos reservados</p>
          </div>
        </div>
      </footer>

      {/* WhatsApp flutuante */}
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener"
        aria-label="Falar no WhatsApp"
        className="fixed bottom-6 right-6 z-50 grid size-14 place-items-center rounded-full bg-at-gold text-at-ink shadow-lg shadow-at-gold/30 transition-transform hover:scale-110"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-7"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.14h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.24 8.24 0 0 1-1.26-4.4c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.55-3.7 8.25-8.24 8.25Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.14.17-.24.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43l-.48-.01c-.16 0-.43.06-.66.31-.22.24-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
        </svg>
      </a>
    </div>
  );
}
