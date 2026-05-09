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
  Truck,
  BarChart3,
  Receipt,
  MessageSquare,
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
  { label: "Operação", href: "/operation", icon: Truck },
  { label: "Fiscal", href: "/fiscal", icon: Receipt },
  { label: "Comunicação", href: "/communication", icon: MessageSquare },
  { label: "Comissões", href: "/commissions", icon: Percent },
  { label: "Consulta IMEI", href: "/imei", icon: Smartphone },
  { label: "Configurações", href: "/settings", icon: Settings },
];

export const adminNavItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Tenants", href: "/admin/tenants", icon: Users },
  { label: "Planos", href: "/admin/plans", icon: DollarSign },
  { label: "Pré-cadastros", href: "/admin/pre-registrations", icon: FileText },
  { label: "Relatórios", href: "/admin/reports", icon: BarChart3 },
];
