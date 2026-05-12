import {
  LayoutDashboard,
  Users,
  BookOpen,
  Package,
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
  { label: "Estoque", href: "/stock", icon: Package },
];

export const adminNavItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
];
