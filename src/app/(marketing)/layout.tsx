import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "pdvdepix — Receba em PIX vendendo com DePix",
  description:
    "Aceite DePix no seu balcao e receba em PIX na hora, com taxa baixa e sem maquininha. O PDV cripto que fala a lingua do seu caixa.",
  openGraph: {
    title: "pdvdepix — Receba em PIX vendendo com DePix",
    description:
      "Aceite DePix no seu balcao e receba em PIX na hora, com taxa baixa e sem maquininha.",
    type: "website",
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layout proprio da landing: sem shell de app, sem auth. Fundo claro fixo
  // (a landing nao segue o tema dark/light da intranet).
  return <div className="bg-white text-slate-900">{children}</div>;
}
