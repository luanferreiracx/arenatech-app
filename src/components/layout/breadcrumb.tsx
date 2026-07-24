"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const segmentLabels: Record<string, string> = {
  // Top-level modules (English route slugs)
  painel: "Painel",
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
  reports: "Relatórios",
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
  providers: "Prestadores",

  // Módulos/rotas que faltavam (caíam no fallback capitalize: "Quick-sales").
  interests: "Interesses",
  valuations: "Avaliações",
  "quick-sales": "Vendas Avulsas",
  simulator: "Simulador",
  "my-commission": "Minha Comissão",
  "iphone-hunter": "Buscar iPhones",
  "aparelhos-catalogo": "Catálogo de Aparelhos",
  "depix-wallet": "DePix Wallet",
  // Financeiro
  receivables: "Recebimentos",
  "card-receivables": "Recebíveis de Cartão",
  pending: "Pendentes",
  dre: "DRE",
  "projected-cash-flow": "Fluxo Projetado",
  categorias: "Categorias",
  "contas-pagar": "Contas a Pagar",
  "contas-receber": "Contas a Receber",
  criar: "Criar",
  // Estoque
  entry: "Entrada",
  exit: "Baixa",
  import: "Importar CSV",
  suppliers: "Fornecedores",
  categories: "Categorias",
  // Caixa / OS / Fiscal / Config
  reviews: "Conferências",
  "technician-report": "Relatório de Técnicos",
  entrada: "NF-e Entrada",
  inutilizar: "Inutilizar",
  nfe: "NF-e",
  installments: "Taxas do Simulador",
  security: "Segurança",
  subscription: "Assinatura",
  bot: "Assistente",
  logs: "Logs",
  assistance: "Assistência",
};

/** Segmento é um UUID (id de detalhe na rota)? Não vira crumb com o id cru. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getLabel(segment: string): string {
  if (UUID_RE.test(segment)) return "Detalhe";
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
            href="/painel"
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
