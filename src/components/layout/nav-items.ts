import {
  LayoutDashboard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const appNavItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
];

export const adminNavItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
];
