import {
  LayoutDashboard,
  Users,
  BookOpen,
  Package,
  Banknote,
  Wallet,
  ClipboardList,
  ShoppingCart,
  FileText,
  Percent,
  Smartphone,
  Truck,
  MessageSquare,
  Settings,
  Building,
  CreditCard,
  FileBarChart,
  UserPlus,
  Calculator,
  Star,
  CheckSquare,
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
  { label: "PDV", href: "/pdv", icon: ShoppingCart },
  { label: "Estoque", href: "/stock", icon: Package },
  { label: "Caixa", href: "/cashier", icon: Banknote },
  { label: "Financeiro", href: "/financial", icon: Wallet },
  { label: "Fiscal", href: "/fiscal", icon: FileText },
  { label: "Simulador", href: "/simulator", icon: Calculator },
  { label: "Avaliacoes", href: "/valuations", icon: Star },
  { label: "Checklist", href: "/checklist", icon: CheckSquare },
  { label: "Comissoes", href: "/commissions", icon: Percent },
  { label: "Consulta IMEI", href: "/imei", icon: Smartphone },
  { label: "Operacao", href: "/operation", icon: Truck },
  { label: "Comunicacao", href: "/communication", icon: MessageSquare },
  { label: "Configuracoes", href: "/settings", icon: Settings },
];

export const adminNavItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Tenants", href: "/admin/tenants", icon: Building },
  { label: "Planos", href: "/admin/plans", icon: CreditCard },
  { label: "Pre-cadastros", href: "/admin/pre-registrations", icon: UserPlus },
  { label: "Relatorios", href: "/admin/reports", icon: FileBarChart },
];
