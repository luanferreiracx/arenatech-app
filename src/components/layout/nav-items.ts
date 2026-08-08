import {
  LayoutDashboard,
  Users,
  Package,
  AlertTriangle,
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
  Bookmark,
  Building2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  MessageSquare,
  Undo2,
  Puzzle,
  Clock,
  Smartphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isRouteAllowedWhileBlocked } from "@/lib/modules";
import type { ModuleKey } from "@/lib/modules";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Quando definido, item só aparece para tenants cujo slug corresponde. */
  requiresTenantSlug?: string;
  /**
   * Item de gerência: some do menu para operador. O menu não tinha dimensão de
   * PAPEL nenhuma — telas admin-only apareciam para todo mundo, e o operador que
   * clicasse tomava 403 com um toast genérico e uma tela pela metade. Isto é
   * conveniência de navegação; quem autoriza de verdade é a procedure.
   */
  adminOnly?: boolean;
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

// Ordem do menu por FREQUÊNCIA DE USO na operação diária de loja/assistência:
// painel → vender (PDV) → atender (OS) → caixa → clientes → estoque →
// financeiro → ferramentas → fiscal → comissões → configurações. O que se usa o
// dia inteiro fica no topo; gestão/config desce. Itens gateados por `module`
// somem sozinhos pra quem não tem o módulo (isNavItemVisible).
export const appNavGroups: NavGroup[] = [
  {
    title: null,
    items: [
      { label: "Painel", href: "/painel", icon: LayoutDashboard },
    ],
  },
  {
    title: "Vendas",
    items: [
      // Venda livre é `pdv-retail`: o plano de assistência tem PDV só para
      // RECEBER OS, e oferecer "Nova Venda" ali levaria a um FORBIDDEN.
      { label: "PDV / Nova Venda", href: "/pdv", icon: ShoppingCart, module: "pdv-retail" },
      { label: "Histórico de Vendas", href: "/pdv/history", icon: History, module: "pdv" },
    ],
  },
  {
    title: "Ferramentas",
    items: [
      { label: "Simulador", href: "/simulator", icon: Calculator, module: "tools" },
      { label: "Avaliar Aparelho", href: "/valuations", icon: Star, module: "tools" },
      { label: "Consultas", href: "/imei", icon: Shield, module: "imei-lookup" }, // aposentado
    ],
  },
  {
    title: "Assistência",
    items: [
      { label: "Ordens de Serviço", href: "/service-orders", icon: ClipboardList, module: "service-orders" },
      { label: "Operação", href: "/operation", icon: Truck, module: "service-orders" },
      { label: "Gestão de Serviços", href: "/services", icon: Wrench, module: "service-orders" },
      { label: "Relatório de Técnicos", href: "/service-orders/technician-report", icon: BarChart3, module: "service-orders" },
    ],
  },
  {
    title: "Caixa",
    items: [
      { label: "Caixa", href: "/cashier", icon: Banknote, module: "cashier" },
      { label: "Conferencias", href: "/cashier/reviews", icon: CheckSquare, module: "cashier", adminOnly: true },
    ],
  },
  {
    title: "Clientes",
    items: [
      { label: "Lista de Clientes", href: "/customers", icon: Users, module: "customers" },
      { label: "Interesses", href: "/interests", icon: Heart, module: "customers" },
      { label: "Fidelidade", href: "/fidelidade", icon: Star, module: "customers" },
      { label: "Comunicação", href: "/communication", icon: MessageSquare, module: "customers" },
    ],
  },
  {
    title: "Estoque",
    items: [
      { label: "Produtos", href: "/stock", icon: Package, module: "stock" },
      { label: "Entrada", href: "/stock/entry", icon: ArrowDownToLine, module: "stock" },
      { label: "Baixa", href: "/stock/exit", icon: ArrowUpFromLine, module: "stock" },
      { label: "Movimentações", href: "/stock/movements", icon: ArrowDownUp, module: "stock" },
      { label: "Compra de Aparelhos", href: "/stock/purchases", icon: ShoppingBag, module: "stock" },
      { label: "Fornecedores", href: "/stock/suppliers", icon: Building2, module: "stock" },
      { label: "Categorias", href: "/stock/categories", icon: Tags, module: "stock" },
      { label: "Marcas", href: "/stock/brands", icon: Bookmark, module: "stock" },
      { label: "Catálogo Aparelhos", href: "/aparelhos-catalogo", icon: Smartphone, module: "stock" },
      { label: "Importar CSV", href: "/stock/import", icon: Download, module: "stock" },
      { label: "Relatórios", href: "/stock/reports", icon: BarChart3, module: "stock" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { label: "Financeiro", href: "/financial", icon: Wallet, module: "financial" },
      { label: "Recebimentos", href: "/financial/receivables", icon: Receipt, module: "financial" },
      { label: "Recebíveis de Cartão", href: "/financial/card-receivables", icon: CreditCard, module: "financial" },
      { label: "Pendentes", href: "/financial/pending", icon: Clock, module: "financial" },
      { label: "Contas a Receber", href: "/financial?type=RECEIVABLE", icon: Receipt, module: "financial" },
      // Operador não vê PAYABLE (ADR 0032, M9-3) nem relatório consolidado
      // (M9-1, decisão do dono em 06/08) — o resolver nega os três. Sem
      // `adminOnly` o menu oferecia telas que o backend recusa.
      { label: "Contas a Pagar", href: "/financial?type=PAYABLE", icon: Receipt, module: "financial", adminOnly: true },
      { label: "Fluxo Projetado", href: "/financial/projected-cash-flow", icon: TrendingUp, module: "financial", adminOnly: true },
      { label: "DRE", href: "/financial/dre", icon: BarChart3, module: "financial", adminOnly: true },
      { label: "Contas Recorrentes", href: "/financial/recorrentes", icon: Clock, module: "financial" },
      { label: "Categorias", href: "/financial/categorias", icon: Tags, module: "financial" },
      { label: "DePix Wallet", href: "/depix-wallet", icon: Wallet, module: "wallet" },
      // Vendas Avulsas (/quick-sales, módulo depix-ops) NÃO tem item de menu: a
      // cobrança avulsa foi superada pelo Link de Pagamento (PaymentLink + /pay,
      // no módulo wallet). O router/rota seguem ativos (webhooks, histórico), mas
      // fora da navegação direta — decisão do dono.
    ],
  },
  {
    title: "Fiscal",
    items: [
      { label: "Fiscal", href: "/fiscal", icon: FileText, module: "fiscal" },
      { label: "NF-e Entrada", href: "/fiscal/entrada", icon: Download, module: "fiscal" },
      { label: "Relatório NF", href: "/reports", icon: BarChart3, module: "fiscal" },
    ],
  },
  {
    title: "Comissões",
    items: [
      { label: "Comissões", href: "/commissions/providers", icon: Percent, module: "commissions" },
      // Self-service: cada prestador ve a propria apuracao. Gateado pelo modulo
      // (fora de tenants sem comissao); a pagina mostra empty state para quem
      // nao e prestador.
      { label: "Minha Comissão", href: "/my-commission", icon: Wallet, module: "commissions" },
    ],
  },
  {
    title: "Configurações",
    items: [
      // Cada item aponta pro módulo FUNCIONAL da aba (mesmo mapa de
      // SETTINGS_TAB_MODULE/resolveModuleForPath): um tenant só-wallet vê
      // Config. Gerais e Segurança, mas não Formas de Pagamento/Simulador/
      // Entregadores — que dependem de pdv/tools/service-orders.
      //
      // `adminOnly` acompanha SETTINGS_OPERATOR_TABS em modules.ts: dessas quatro,
      // só Entregadores é trabalho de operação (as procedures de entregador não
      // exigem admin). As outras três o operador via no menu e no submit levava
      // 403 — e o proxy agora barra a URL direta também.
      { label: "Configurações Gerais", href: "/settings", icon: Settings, module: "settings", adminOnly: true },
      { label: "Formas de Pagamento", href: "/settings/payment-methods", icon: CreditCard, module: "pdv", adminOnly: true },
      { label: "Taxas do Simulador", href: "/settings/installments", icon: Percent, module: "tools", adminOnly: true },
      { label: "Entregadores", href: "/settings/delivery-persons", icon: Truck, module: "service-orders" },
      // Sem `module`: Seguranca (2FA + senha) e disponivel a QUALQUER tenant —
      // tenants wallet/NO-KYC precisam habilitar 2FA pra sacar (sem isso ficavam
      // sem acesso a pagina, num beco). Veja resolveModuleForPath em modules.ts.
      { label: "Seguranca", href: "/settings/security", icon: Lock },
    ],
  },
];

// Flat list for backward compatibility (mobile sidebar, etc.)
export const appNavItems: NavItem[] = appNavGroups.flatMap((g) => g.items);

/**
 * True se o item de menu deve ser exibido para o tenant ativo.
 * Regra única compartilhada por sidebar, mobile-sidebar e command-palette:
 * - respeita `blocked` (ADR 0061): assinatura suspensa esconde tudo que o proxy
 *   vai recusar — inclusive itens sem `module`, como o Painel;
 * - respeita `requiresTenantSlug` (gating por slug, ex.: iphone-hunter);
 * - respeita `module` (gating por plano): item sem `module` é sempre exibido;
 *   item com `module` só aparece se o módulo está liberado para o tenant;
 * - respeita `adminOnly`: tela de gerência some para operador.
 */
export function isNavItemVisible(
  item: NavItem,
  ctx: {
    tenantSlug?: string | null;
    allowedModules?: readonly string[];
    isTenantAdmin?: boolean;
    /** Assinatura suspensa por inadimplência (ADR 0061). */
    blocked?: boolean;
  },
): boolean {
  // Vem primeiro e olha o HREF, não o módulo: com a assinatura suspensa o
  // Painel continuava no menu (item sem `module`, sempre visível) e clicar nele
  // devolvia o usuário para a tela de bloqueio. Menu que oferece caminho fechado
  // é o mesmo defeito que o gating por papel já corrigiu — quem autoriza é o
  // proxy; isto é não oferecer o que vai dar em negativa.
  if (ctx.blocked && !isRouteAllowedWhileBlocked(item.href)) {
    return false;
  }
  if (item.requiresTenantSlug && item.requiresTenantSlug !== ctx.tenantSlug) {
    return false;
  }
  if (item.adminOnly && !ctx.isTenantAdmin) {
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
  { label: "Carteira de Taxas", href: "/admin/depix-fees", icon: Percent },
  { label: "Saques Retidos", href: "/admin/depix-holds", icon: AlertTriangle },
  { label: "Relatórios", href: "/admin/reports", icon: FileText },
];
