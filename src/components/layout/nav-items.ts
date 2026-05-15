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
  UserCog,
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  title: string | null; // null = no group header (e.g. Dashboard)
  items: NavItem[];
}

export const appNavGroups: NavGroup[] = [
  {
    title: null,
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    title: "Assistencia",
    items: [
      { label: "Ordens de Servico", href: "/service-orders", icon: ClipboardList },
      { label: "Relatorio Tecnicos", href: "/service-orders/technician-report", icon: BarChart3 },
      { label: "Gestao de Servicos", href: "/services", icon: Wrench },
      { label: "Operacao", href: "/operation", icon: Truck },
      { label: "Comunicacao", href: "/communication", icon: MessageSquare },
    ],
  },
  {
    title: "Clientes",
    items: [
      { label: "Lista de Clientes", href: "/customers", icon: Users },
      { label: "Interesses", href: "/interests", icon: Heart },
    ],
  },
  {
    title: "Ferramentas",
    items: [
      { label: "Simulador", href: "/simulator", icon: Calculator },
      { label: "Avaliar Aparelho", href: "/valuations", icon: Star },
      { label: "Consulta IMEI", href: "/imei", icon: Shield },
      { label: "Checklist", href: "/checklist", icon: CheckSquare },
    ],
  },
  {
    title: "Comercial",
    items: [
      { label: "Vendas", href: "/pdv", icon: ShoppingCart },
      { label: "Historico de Vendas", href: "/pdv/history", icon: History },
      { label: "Vendas Avulsas", href: "/quick-sales", icon: CreditCard },
    ],
  },
  {
    title: "Estoque",
    items: [
      { label: "Produtos", href: "/stock", icon: Package },
      { label: "Fornecedores", href: "/stock/suppliers", icon: Building2 },
      { label: "Categorias", href: "/stock/categories", icon: Tags },
      { label: "Entrada", href: "/stock/entry", icon: ArrowDownToLine },
      { label: "Baixa", href: "/stock/exit", icon: ArrowUpFromLine },
      { label: "Compra de Aparelhos", href: "/stock/purchases", icon: ShoppingBag },
      { label: "Movimentacoes", href: "/stock/movements", icon: ArrowDownUp },
      { label: "Relatorios", href: "/stock/reports", icon: BarChart3 },
      { label: "Importar CSV", href: "/stock/import", icon: Download },
    ],
  },
  {
    title: "Caixa",
    items: [
      { label: "Caixa", href: "/cashier", icon: Banknote },
      { label: "Conferencias", href: "/cashier/reviews", icon: CheckSquare },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { label: "Financeiro", href: "/financial", icon: Wallet },
      { label: "Recebimentos", href: "/financial/receivables", icon: Receipt },
      { label: "Pendentes", href: "/financial/pending", icon: Clock },
      { label: "Contas a Receber", href: "/financial?type=RECEIVABLE", icon: Receipt },
      { label: "Contas a Pagar", href: "/financial?type=PAYABLE", icon: Receipt },
      { label: "Fluxo Projetado", href: "/financial/projected-cash-flow", icon: TrendingUp },
      { label: "DRE", href: "/financial/dre", icon: BarChart3 },
      { label: "Saques DePix", href: "/depix/withdrawals", icon: Banknote },
    ],
  },
  {
    title: "Fiscal",
    items: [
      { label: "Fiscal", href: "/fiscal", icon: FileText },
      { label: "NF-e Entrada", href: "/fiscal/entrada", icon: Download },
      { label: "Inutilizar", href: "/fiscal/inutilizar", icon: Ban },
      { label: "Relatorio NF", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    title: "Comissoes",
    items: [
      { label: "Comissoes", href: "/commissions", icon: Percent },
      { label: "Minha Comissao", href: "/commissions/my", icon: Percent },
      { label: "Prestadores", href: "/commissions/providers", icon: Truck },
    ],
  },
  {
    title: "Configuracoes",
    items: [
      { label: "Config. Gerais", href: "/settings", icon: Settings },
      { label: "Formas de Pagamento", href: "/settings/payment-methods", icon: CreditCard },
      { label: "Entregadores", href: "/settings/delivery-persons", icon: Truck },
      { label: "Usuarios", href: "/settings/users", icon: UserCog },
      { label: "Seguranca", href: "/settings/security", icon: Lock },
    ],
  },
];

// Flat list for backward compatibility (mobile sidebar, etc.)
export const appNavItems: NavItem[] = appNavGroups.flatMap((g) => g.items);

// Admin sidebar items
export const adminNavItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Tenants", href: "/admin/tenants", icon: Package },
  { label: "Planos", href: "/admin/plans", icon: CreditCard },
  { label: "Pre-cadastros", href: "/admin/pre-registrations", icon: Users },
  { label: "Addons", href: "/admin/addons", icon: Puzzle },
  { label: "Estornos", href: "/admin/refunds", icon: Undo2 },
  { label: "WhatsApp Logs", href: "/admin/whatsapp-logs", icon: MessageSquare },
  { label: "Relatorios", href: "/admin/reports", icon: FileText },
];
