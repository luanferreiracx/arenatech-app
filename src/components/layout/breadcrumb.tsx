"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const segmentLabels: Record<string, string> = {
  // Top-level modules (English route slugs)
  customers: "Clientes",
  "service-orders": "Ordens de Serviço",
  pdv: "PDV",
  cashier: "Caixa",
  stock: "Estoque",
  catalog: "Catálogo",
  financial: "Financeiro",
  fiscal: "Fiscal",
  commissions: "Comissões",
  imei: "Consultas",
  operation: "Operação",
  communication: "Comunicação",
  settings: "Configurações",
  dev: "Dev",
  components: "Componentes",

  // Sub-routes
  new: "Novo",
  edit: "Editar",
  history: "Histórico",
  "select-tenant": "Trocar de Loja",
  "cash-flow": "Fluxo de Caixa",
  movements: "Movimentações",
  purchases: "Compras",
  report: "Relatório",
  rules: "Regras",
  send: "Enviar",
  templates: "Modelos",
  general: "Geral",
  "payment-methods": "Métodos de Pagamento",
  integrations: "Integrações",
  users: "Usuários",
  services: "Serviços",
  "diagnostic-templates": "Modelos de Diagnóstico",
  "device-categories": "Categorias de Dispositivos",
  devices: "Dispositivos",
  "delivery-persons": "Entregadores",
  labs: "Laboratórios",
  "lab-orders": "Ordens de Laboratório",
  providers: "Fornecedores",
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
