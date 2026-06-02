import type { Metadata } from "next";
import { Bricolage_Grotesque, Outfit, JetBrains_Mono } from "next/font/google";

/**
 * Fontes da landing — escolhas distintivas (skill frontend-design):
 * - Bricolage Grotesque: display caracteristico (titulos)
 * - Outfit: corpo limpo, sem cair no Inter/system
 * - JetBrains Mono: numeros/valores, reforca o tom "terminal de pagamentos"
 * Escopadas via classe no wrapper — nao afetam a intranet.
 */
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

export const metadata: Metadata = {
  title: "pdvdepix — Receba em PIX vendendo com DePix",
  description:
    "Aceite DePix no balcão e receba em PIX na hora, com taxa baixa e sem maquininha. O PDV cripto que fala a língua do seu caixa.",
  openGraph: {
    title: "pdvdepix — Receba em PIX vendendo com DePix",
    description:
      "Aceite DePix no balcão e receba em PIX na hora, com taxa baixa e sem maquininha.",
    type: "website",
  },
};

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
