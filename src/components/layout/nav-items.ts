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
      { label: "Gestao de Servicos", href: "/services", icon: Wrench },
      { label: "Taxas de Parcelamento", href: "/settings/installments", icon: Percent },
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
      { label: "Checklist", href: "/checklist", icon: CheckSquare },
    ],
  },
  {
    title: "Comercial",
    items: [
      { label: "Vendas", href: "/pdv", icon: ShoppingCart },
      { label: "Historico de Vendas", href: "/pdv/history", icon: History },
    ],
  },
  {
    title: "Estoque",
    items: [
      { label: "Produtos", href: "/stock", icon: Package },
      { label: "Compra de Aparelhos", href: "/stock/purchases", icon: ShoppingBag },
      { label: "Movimentacoes", href: "/stock/movements", icon: ArrowDownUp },
    ],
  },
  {
    title: "Caixa",
    items: [
      { label: "Caixa", href: "/cashier", icon: Banknote },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { label: "Financeiro", href: "/financial", icon: Wallet },
      { label: "Contas a Receber", href: "/financial?type=RECEIVABLE", icon: Receipt },
      { label: "Contas a Pagar", href: "/financial?type=PAYABLE", icon: Receipt },
    ],
  },
  {
    title: "Fiscal",
    items: [
      { label: "Fiscal", href: "/fiscal", icon: FileText },
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

// Admin sidebar items (unchanged)
export const adminNavItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Tenants", href: "/admin/tenants", icon: Package },
  { label: "Planos", href: "/admin/plans", icon: CreditCard },
  { label: "Pre-cadastros", href: "/admin/pre-registrations", icon: Users },
  { label: "Relatorios", href: "/admin/reports", icon: FileText },
];
