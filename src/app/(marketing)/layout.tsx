import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import { Bricolage_Grotesque, Outfit, JetBrains_Mono } from "next/font/google";
import { normalizeHost } from "@/lib/brand-host";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700", "800"],
});
const body = Outfit({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600"],
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-pdv",
  weight: ["400", "500", "700"],
});

const PDVCRIPTO_HOSTS = new Set(["pdvcripto.app", "www.pdvcripto.app"]);

export async function generateMetadata(): Promise<Metadata> {
  noStore();
  const headerStore = await headers();
  const host = normalizeHost(headerStore.get("x-forwarded-host") ?? headerStore.get("host"));
  if (PDVCRIPTO_HOSTS.has(host)) {
    return {
      title: "pdvcripto — Receba em PIX vendendo com Cripto",
      description:
        "Aceite Cripto no balcão e receba em PIX na hora, sem maquininha. O PDV cripto que fala a língua do seu caixa.",
      openGraph: {
        title: "pdvcripto — Receba em PIX vendendo com Cripto",
        description: "Aceite Cripto no balcão e receba em PIX na hora, sem maquininha.",
        type: "website",
      },
    };
  }
  return {
    title: "pdvdepix — Receba em PIX vendendo com DePix",
    description:
      "Aceite DePix no balcão e receba em PIX na hora, com taxa baixa e sem maquininha. O PDV cripto que fala a língua do seu caixa.",
    openGraph: {
      title: "pdvdepix — Receba em PIX vendendo com DePix",
      description: "Aceite DePix no balcão e receba em PIX na hora, com taxa baixa e sem maquininha.",
      type: "website",
    },
  };
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      style={{ fontFamily: "var(--font-body)" }}
    >
      {children}
    </div>
  );
}
