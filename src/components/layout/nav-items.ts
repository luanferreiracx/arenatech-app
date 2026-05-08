import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  ShoppingCart,
  Wallet,
  Package,
  BookOpen,
  DollarSign,
  FileText,
  TrendingUp,
  Star,
  Truck,
  Settings,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const appNavItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Ordens de Serviço", href: "/service-orders", icon: ClipboardList },
  { label: "PDV", href: "/pdv", icon: ShoppingCart },
  { label: "Caixa", href: "/cashier", icon: Wallet },
  { label: "Estoque", href: "/stock", icon: Package },
  { label: "Catálogo", href: "/catalogo", icon: BookOpen },
  { label: "Financeiro", href: "/financial", icon: DollarSign },
  { label: "Fiscal", href: "/fiscal", icon: FileText },
  { label: "Comissões", href: "/comissoes", icon: TrendingUp },
  { label: "Recompensas", href: "/recompensas", icon: Star },
  { label: "Operação", href: "/operacao", icon: Truck },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];

export const adminNavItems: NavItem[] = [
  { label: "Tenants", href: "/admin/tenants", icon: LayoutDashboard },
  { label: "Planos", href: "/admin/planos", icon: DollarSign },
  { label: "Pré-cadastros", href: "/admin/pre-cadastros", icon: Users },
  { label: "Cobranças", href: "/admin/cobrancas", icon: Wallet },
  { label: "Relatórios", href: "/admin/relatorios", icon: FileText },
];
