import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Wallet,
  Package,
  BookOpen,
  DollarSign,
  FileText,
  Settings,
  ShoppingCart,
  Percent,
  Smartphone,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const appNavItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Clientes", href: "/customers", icon: Users },
  { label: "Ordens de Serviço", href: "/service-orders", icon: ClipboardList },
  { label: "PDV", href: "/pdv", icon: ShoppingCart },
  { label: "Caixa", href: "/cashier", icon: Wallet },
  { label: "Estoque", href: "/stock", icon: Package },
  { label: "Catálogo", href: "/catalog", icon: BookOpen },
  { label: "Financeiro", href: "/financial", icon: DollarSign },
  { label: "Comissões", href: "/commissions", icon: Percent },
  { label: "Consulta IMEI", href: "/imei", icon: Smartphone },
  { label: "Configurações", href: "/settings", icon: Settings },
];

export const adminNavItems: NavItem[] = [
  { label: "Tenants", href: "/admin/tenants", icon: LayoutDashboard },
  { label: "Planos", href: "/admin/planos", icon: DollarSign },
  { label: "Pré-cadastros", href: "/admin/pre-cadastros", icon: Users },
  { label: "Cobranças", href: "/admin/cobrancas", icon: Wallet },
  { label: "Relatórios", href: "/admin/relatorios", icon: FileText },
];
