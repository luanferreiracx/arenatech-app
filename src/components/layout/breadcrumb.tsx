"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const segmentLabels: Record<string, string> = {
  clientes: "Clientes",
  ordens: "Ordens de Serviço",
  pdv: "PDV",
  caixa: "Caixa",
  estoque: "Estoque",
  catalogo: "Catálogo",
  financeiro: "Financeiro",
  fiscal: "Fiscal",
  comissoes: "Comissões",
  recompensas: "Recompensas",
  operacao: "Operação",
  configuracoes: "Configurações",
  perfil: "Perfil",
  novo: "Novo",
  editar: "Editar",
  "select-tenant": "Trocar de Loja",
};

function getLabel(segment: string): string {
  return segmentLabels[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function AppBreadcrumb({ className }: { className?: string }) {
  const pathname = usePathname();

  if (pathname === "/") {
    return (
      <nav className={cn("flex items-center text-sm", className)} aria-label="Breadcrumb">
        <span className="text-foreground font-medium flex items-center gap-1">
          <Home className="w-3.5 h-3.5" />
          Dashboard
        </span>
      </nav>
    );
  }

  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav className={cn("flex items-center text-sm", className)} aria-label="Breadcrumb">
      <ol className="flex items-center gap-1">
        <li>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Home className="w-3.5 h-3.5" />
          </Link>
        </li>
        {segments.map((segment, i) => {
          const isLast = i === segments.length - 1;
          const href = "/" + segments.slice(0, i + 1).join("/");

          return (
            <li key={href} className="flex items-center gap-1">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              {isLast ? (
                <span className="text-foreground font-medium">{getLabel(segment)}</span>
              ) : (
                <Link
                  href={href}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {getLabel(segment)}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
