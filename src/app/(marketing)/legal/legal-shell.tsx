import Link from "next/link";
import type { ReactNode } from "react";
import type { LegalBrand } from "./brand";

const LEGAL_LINKS = [
  { href: "/legal/termos", label: "Termos de Uso" },
  { href: "/legal/privacidade", label: "Privacidade" },
  { href: "/legal/reembolso", label: "Reembolso" },
  { href: "/legal/avisos", label: "Avisos" },
] as const;

/**
 * Casca comum das páginas legais: cabeçalho com a marca (por domínio), navegação
 * entre os documentos e o corpo. Pública (sem auth) — reutilizada pelas 4 páginas.
 */
export function LegalShell({
  brand,
  title,
  updatedAt,
  children,
}: {
  brand: LegalBrand;
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            {brand.name}
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Última atualização: {updatedAt}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
          {children}
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-3xl px-6 py-6 text-xs text-muted-foreground">
          {brand.name} — {brand.domain} · Operado por {brand.legalEntity} · Contato: {brand.contactEmail}
        </div>
      </footer>
    </div>
  );
}
