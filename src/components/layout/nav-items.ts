import {
  LayoutDashboard,
  Users,
  Package,
  Banknote,
  Wallet,
  ClipboardList,
  ShoppingCart,
  FileText,
  Percent,
  Truck,
  Settings,
  CreditCard,
  Calculator,
  Star,
  CheckSquare,
  Wrench,
  Heart,
  History,
  ArrowDownUp,
  ShoppingBag,
  Receipt,
  Shield,
  Lock,
  TrendingUp,
  BarChart3,
  Tags,
  Building2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Ban,
  Download,
  MessageSquare,
  Undo2,
  Puzzle,
  Clock,
  Smartphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModuleKey } from "@/lib/modules";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Quando definido, item só aparece para tenants cujo slug corresponde. */
  requiresTenantSlug?: string;
  /**
   * Módulo ao qual o item pertence (gating por plano). Itens sem `module`
   * são sempre exibidos (infra mínima: painel, configurações).
   */
  module?: ModuleKey;
}

export interface NavGroup {
  title: string | null; // null = no group header (e.g. Dashboard)
  items: NavItem[];
}

export const appNavGroups: NavGroup[] = [
  {
    title: null,
    items: [
      { label: "Painel", href: "/painel", icon: LayoutDashboard },
    ],
  },
  {
    title: "Assistencia",
    items: [
      { label: "Ordens de Servico", href: "/service-orders", icon: ClipboardList, module: "service-orders" },
      { label: "Relatorio Tecnicos", href: "/service-orders/technician-report", icon: BarChart3, module: "service-orders" },
      { label: "Gestao de Servicos", href: "/services", icon: Wrench, module: "service-orders" },
      { label: "Operacao", href: "/operation", icon: Truck, module: "service-orders" },
      { label: "Comunicacao", href: "/communication", icon: MessageSquare, module: "service-orders" },
    ],
  },
  {
    title: "Clientes",
    items: [
      { label: "Lista de Clientes", href: "/customers", icon: Users, module: "customers" },
      { label: "Interesses", href: "/interests", icon: Heart, module: "customers" },
    ],
  },
  {
    title: "Ferramentas",
    items: [
      { label: "Simulador", href: "/simulator", icon: Calculator, module: "tools" },
      { label: "Avaliar Aparelho", href: "/valuations", icon: Star, module: "tools" },
      { label: "Consultas", href: "/imei", icon: Shield, module: "tools" },
      { label: "Checklist", href: "/checklist", icon: CheckSquare, module: "tools" },
      {
        label: "Buscar iPhones",
        href: "/iphone-hunter",
        icon: Smartphone,
        requiresTenantSlug: "arena-tech",
      },
    ],
  },
  {
    title: "Comercial",
    items: [
      { label: "Vendas", href: "/pdv", icon: ShoppingCart, module: "pdv" },
      { label: "Historico de Vendas", href: "/pdv/history", icon: History, module: "pdv" },
    ],
  },
  {
    title: "Estoque",
    items: [
      { label: "Produtos", href: "/stock", icon: Package, module: "stock" },
      { label: "Fornecedores", href: "/stock/suppliers", icon: Building2, module: "stock" },
      { label: "Categorias", href: "/stock/categories", icon: Tags, module: "stock" },
      { label: "Entrada", href: "/stock/entry", icon: ArrowDownToLine, module: "stock" },
      { label: "Baixa", href: "/stock/exit", icon: ArrowUpFromLine, module: "stock" },
      { label: "Compra de Aparelhos", href: "/stock/purchases", icon: ShoppingBag, module: "stock" },
      { label: "Movimentacoes", href: "/stock/movements", icon: ArrowDownUp, module: "stock" },
      { label: "Relatorios", href: "/stock/reports", icon: BarChart3, module: "stock" },
      { label: "Importar CSV", href: "/stock/import", icon: Download, module: "stock" },
      { label: "Catálogo Aparelhos", href: "/aparelhos-catalogo", icon: Smartphone, module: "stock" },
    ],
  },
  {
    title: "Caixa",
    items: [
      { label: "Caixa", href: "/cashier", icon: Banknote, module: "cashier" },
      { label: "Conferencias", href: "/cashier/reviews", icon: CheckSquare, module: "cashier" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { label: "Financeiro", href: "/financial", icon: Wallet, module: "financial" },
      { label: "Recebimentos", href: "/financial/receivables", icon: Receipt, module: "financial" },
      { label: "Pendentes", href: "/financial/pending", icon: Clock, module: "financial" },
      { label: "Contas a Receber", href: "/financial?type=RECEIVABLE", icon: Receipt, module: "financial" },
      { label: "Contas a Pagar", href: "/financial?type=PAYABLE", icon: Receipt, module: "financial" },
      { label: "Fluxo Projetado", href: "/financial/projected-cash-flow", icon: TrendingUp, module: "financial" },
      { label: "DRE", href: "/financial/dre", icon: BarChart3, module: "financial" },
      { label: "DePix Wallet", href: "/depix-wallet", icon: Wallet, module: "wallet" },
    ],
  },
  {
    title: "Fiscal",
    items: [
      { label: "Fiscal", href: "/fiscal", icon: FileText, module: "fiscal" },
      { label: "NF-e Entrada", href: "/fiscal/entrada", icon: Download, module: "fiscal" },
      { label: "Inutilizar", href: "/fiscal/inutilizar", icon: Ban, module: "fiscal" },
      { label: "Relatorio NF", href: "/reports", icon: BarChart3, module: "fiscal" },
    ],
  },
  {
    title: "Comissoes",
    items: [
      { label: "Comissoes", href: "/commissions", icon: Percent, module: "commissions" },
      { label: "Minha Comissao", href: "/commissions/my", icon: Percent, module: "commissions" },
      { label: "Prestadores", href: "/commissions/providers", icon: Truck, module: "commissions" },
    ],
  },
  {
    title: "Configuracoes",
    items: [
      { label: "Config. Gerais", href: "/settings", icon: Settings, module: "settings" },
      { label: "Formas de Pagamento", href: "/settings/payment-methods", icon: CreditCard, module: "settings" },
      { label: "Taxas do Simulador", href: "/settings/installments", icon: Percent, module: "settings" },
      { label: "Entregadores", href: "/settings/delivery-persons", icon: Truck, module: "settings" },
      { label: "Seguranca", href: "/settings/security", icon: Lock, module: "settings" },
    ],
  },
];

// Flat list for backward compatibility (mobile sidebar, etc.)
export const appNavItems: NavItem[] = appNavGroups.flatMap((g) => g.items);

/**
 * True se o item de menu deve ser exibido para o tenant ativo.
 * Regra única compartilhada por sidebar, mobile-sidebar e command-palette:
 * - respeita `requiresTenantSlug` (gating por slug, ex.: iphone-hunter);
 * - respeita `module` (gating por plano): item sem `module` é sempre exibido;
 *   item com `module` só aparece se o módulo está liberado para o tenant.
 */
export function isNavItemVisible(
  item: NavItem,
  ctx: { tenantSlug?: string | null; allowedModules?: readonly string[] },
): boolean {
  if (item.requiresTenantSlug && item.requiresTenantSlug !== ctx.tenantSlug) {
    return false;
  }
  if (item.module) {
    return (ctx.allowedModules ?? []).includes(item.module);
  }
  return true;
}

// Admin sidebar items
export const adminNavItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Tenants", href: "/admin/tenants", icon: Package },
  { label: "Planos", href: "/admin/plans", icon: CreditCard },
  { label: "Pre-cadastros", href: "/admin/pre-registrations", icon: Users },
  { label: "Addons", href: "/admin/addons", icon: Puzzle },
  { label: "Estornos", href: "/admin/refunds", icon: Undo2 },
  { label: "WhatsApp Logs", href: "/admin/whatsapp-logs", icon: MessageSquare },
  { label: "L-BTC Refills", href: "/admin/depix-lbtc", icon: Banknote },
  { label: "Relatorios", href: "/admin/reports", icon: FileText },
];
