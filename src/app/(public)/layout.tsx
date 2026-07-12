import type { Metadata } from "next";
import { Bricolage_Grotesque, Outfit, JetBrains_Mono } from "next/font/google";
import "./catalog.css";

/**
 * Fontes do catalogo publico — escolhas distintivas (skill frontend-design),
 * escopadas via classe no wrapper para nao vazar na intranet:
 * - Bricolage Grotesque: display caracteristico (titulos, preco)
 * - Outfit: corpo limpo, foge do Inter/system
 * - JetBrains Mono: valores monetarios, reforca precisao
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-catalog-display",
  weight: ["400", "500", "600", "700", "800"],
});
const body = Outfit({
  subsets: ["latin"],
  variable: "--font-catalog-body",
  weight: ["300", "400", "500", "600", "700"],
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-catalog-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Catálogo | Arena Tech",
  description: "Produtos selecionados, com foto e preço claro. Escolha com calma e chame a loja no WhatsApp.",
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  // Tema claro do catálogo — sem a classe `dark` da intranet. Escopado em
  // .catalog-scope para não vazar para o app.
  return (
    <div className={`catalog-scope ${display.variable} ${body.variable} ${mono.variable}`}>
      {children}
    </div>
  );
}
