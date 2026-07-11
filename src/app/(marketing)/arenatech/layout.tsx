import type { Metadata } from "next";
import { Sora, Hanken_Grotesk } from "next/font/google";

const display = Sora({
  subsets: ["latin"],
  variable: "--font-at-display",
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

const body = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-at-body",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Arena Tech | Loja Apple e Acessórios em Teresina - Riverside Shopping",
  description:
    "Arena Tech em Teresina-PI: iPhone, iPad, MacBook, Apple Watch e AirPods com procedência, além de acessórios premium. Loja física no Riverside Shopping.",
  keywords: [
    "comprar iPhone Teresina",
    "loja Apple Teresina",
    "comprar MacBook Teresina",
    "comprar iPad Teresina",
    "Apple Watch Teresina",
    "AirPods Teresina",
    "acessórios celular Teresina",
    "Riverside Shopping",
    "Arena Tech",
  ],
  authors: [{ name: "Arena Tech" }],
  alternates: { canonical: "https://arenatechpi.com.br" },
  openGraph: {
    title: "Arena Tech | Loja Apple e Acessórios em Teresina",
    description:
      "iPhone, iPad, MacBook, Apple Watch, AirPods e acessórios premium. Loja física no Riverside Shopping, Teresina-PI.",
    url: "https://arenatechpi.com.br",
    siteName: "Arena Tech",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Arena Tech | Loja Apple e Acessórios em Teresina",
    description:
      "iPhone, iPad, MacBook, Apple Watch, AirPods e acessórios premium no Riverside Shopping, Teresina-PI.",
  },
};

export default function ArenaTechLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${display.variable} ${body.variable}`}>{children}</div>
  );
}
