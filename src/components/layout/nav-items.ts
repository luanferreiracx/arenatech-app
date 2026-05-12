import {
  LayoutDashboard,
  Users,
  BookOpen,
  Package,
  Banknote,
  Wallet,
  ClipboardList,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const appNavItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Catalogo", href: "/catalog", icon: BookOpen },
  { label: "Clientes", href: "/customers", icon: Users },
  { label: "Ordens de Servico", href: "/service-orders", icon: ClipboardList },
  { label: "Estoque", href: "/stock", icon: Package },
  { label: "Caixa", href: "/cashier", icon: Banknote },
  { label: "Financeiro", href: "/financial", icon: Wallet },
  { label: "Configuracoes", href: "/settings", icon: Settings },
];

export const adminNavItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
];
