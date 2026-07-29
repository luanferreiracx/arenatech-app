/**
 * Mapa de rotas por módulo, usado pelo harness de auditoria (`crawl-module.ts`).
 *
 * Cada módulo da finalização (docs/FINALIZACAO/00_INDICE.md) lista TODAS as suas
 * telas. Rota dinâmica declara um `resolve` que busca um id real na base — sem
 * isso a auditoria só veria as telas de listagem, que são justamente as que menos
 * quebram.
 */
import type { PrismaClient } from "@prisma/client";

export type AuditRoute = {
  /** Caminho fixo, ou template com `:id` preenchido por `resolve`. */
  path: string;
  /** Busca um id real. Rota é pulada (registrada como SKIP) se devolver null. */
  resolve?: (prisma: PrismaClient, tenantId: string) => Promise<string | null>;
  /** Rota que só o admin do tenant enxerga — operador deve tomar bloqueio. */
  adminOnly?: boolean;
  /** Rota pública (sem sessão). */
  publicRoute?: boolean;
};

export type AuditModule = {
  key: string;
  label: string;
  routes: AuditRoute[];
};

const firstId =
  <K extends keyof PrismaClient>(model: K, orderByCreatedAtDesc = true) =>
  async (prisma: PrismaClient, tenantId: string): Promise<string | null> => {
    const delegate = prisma[model] as unknown as {
      findFirst(args: unknown): Promise<{ id: string } | null>;
    };
    const row = await delegate.findFirst({
      where: { tenantId },
      select: { id: true },
      ...(orderByCreatedAtDesc ? { orderBy: { createdAt: "desc" } } : {}),
    });
    return row?.id ?? null;
  };

export const AUDIT_MODULES: AuditModule[] = [
  {
    key: "caixa",
    label: "1 — Caixa",
    routes: [
      { path: "/cashier" },
      { path: "/cashier/close" },
      { path: "/cashier/history" },
      { path: "/cashier/reviews" },
      { path: "/cashier/:id", resolve: firstId("cashSession") },
    ],
  },
  {
    key: "pdv",
    label: "2 — PDV / Vendas",
    routes: [
      { path: "/pdv" },
      { path: "/pdv/history" },
      { path: "/pdv/:id", resolve: firstId("sale") },
    ],
  },
  {
    key: "estoque",
    label: "3 — Estoque / Compras / Fornecedores",
    routes: [
      { path: "/stock" },
      { path: "/stock/new" },
      { path: "/stock/entry" },
      { path: "/stock/exit" },
      { path: "/stock/movements" },
      { path: "/stock/low-stock" },
      { path: "/stock/categories" },
      { path: "/stock/attributes" },
      { path: "/stock/bulk-adjust", adminOnly: true },
      { path: "/stock/import" },
      { path: "/stock/report" },
      { path: "/stock/reports" },
      { path: "/stock/purchases" },
      { path: "/stock/purchases/new" },
      { path: "/stock/suppliers" },
      { path: "/stock/suppliers/new" },
      { path: "/stock/:id", resolve: firstId("product") },
      { path: "/stock/:id/edit", resolve: firstId("product") },
      { path: "/stock/:id/variations", resolve: firstId("product") },
      { path: "/stock/purchases/:id", resolve: firstId("devicePurchase") },
      { path: "/stock/suppliers/:id", resolve: firstId("supplier") },
      { path: "/stock/suppliers/:id/edit", resolve: firstId("supplier") },
    ],
  },
  {
    key: "os",
    label: "4 — Ordens de Serviço / Serviços / Operação",
    routes: [
      { path: "/service-orders" },
      { path: "/service-orders/new" },
      { path: "/service-orders/technician-report" },
      { path: "/service-orders/:id", resolve: firstId("serviceOrder") },
      { path: "/service-orders/:id/edit", resolve: firstId("serviceOrder") },
      { path: "/services" },
      { path: "/services/new" },
      { path: "/services/manage" },
      { path: "/services/:id/edit", resolve: firstId("service") },
      { path: "/operation" },
      { path: "/checklist" },
    ],
  },
  {
    key: "financeiro",
    label: "5 — Financeiro",
    routes: [
      { path: "/financial" },
      { path: "/financial/new" },
      { path: "/financial/pending" },
      { path: "/financial/receivables" },
      { path: "/financial/card-receivables" },
      { path: "/financial/cash-flow" },
      { path: "/financial/projected-cash-flow" },
      { path: "/financial/dre" },
      { path: "/financial/categorias" },
      { path: "/financial/recorrentes" },
      { path: "/financial/contas-pagar/criar" },
      { path: "/financial/contas-receber/criar" },
      { path: "/financial/:id", resolve: firstId("financialTransaction") },
    ],
  },
  {
    key: "depix",
    label: "6 — DePix Wallet / Vendas Avulsas",
    routes: [
      { path: "/depix-wallet" },
      { path: "/depix-wallet/receive" },
      { path: "/depix-wallet/withdraw" },
      { path: "/depix-wallet/withdraw-external" },
      { path: "/depix-wallet/withdraw-onchain" },
      { path: "/depix-wallet/payment-links" },
      { path: "/depix-wallet/transactions/:id", resolve: firstId("tenantDepixTransaction") },
      { path: "/depix" },
      { path: "/depix/withdrawals" },
      { path: "/depix/withdrawals/new" },
      { path: "/quick-sales" },
      { path: "/quick-sales/new" },
      { path: "/quick-sales/:id", resolve: firstId("quickSale") },
    ],
  },
  {
    key: "fiscal",
    label: "7 — Fiscal / NF-e",
    routes: [
      { path: "/fiscal" },
      { path: "/fiscal/new" },
      { path: "/fiscal/entrada" },
      { path: "/fiscal/:id", resolve: firstId("invoice") },
      { path: "/fiscal/:id/edit", resolve: firstId("invoice") },
    ],
  },
  {
    key: "comissoes",
    label: "8 — Comissões",
    routes: [
      { path: "/commissions" },
      { path: "/commissions/providers" },
      { path: "/commissions/providers/new" },
      { path: "/commissions/providers/:id", resolve: firstId("provider") },
      { path: "/my-commission" },
    ],
  },
  {
    key: "clientes",
    label: "9 — Clientes / Interesses",
    routes: [
      { path: "/customers" },
      { path: "/customers/new" },
      { path: "/customers/:id", resolve: firstId("customer") },
      { path: "/customers/:id/edit", resolve: firstId("customer") },
      { path: "/interests" },
      { path: "/interests/new" },
      { path: "/interests/:id", resolve: firstId("interest") },
    ],
  },
  {
    key: "config",
    label: "10 — Configurações / Equipe / Auth",
    routes: [
      { path: "/settings" },
      { path: "/settings/general" },
      { path: "/settings/assistance" },
      { path: "/settings/payment-methods" },
      { path: "/settings/installments" },
      { path: "/settings/card-acquirers" },
      { path: "/settings/receiving" },
      { path: "/settings/fiscal" },
      { path: "/settings/depix" },
      { path: "/settings/integrations" },
      { path: "/settings/delivery-persons" },
      { path: "/settings/team" },
      { path: "/settings/users" },
      { path: "/settings/users/new" },
      { path: "/settings/security" },
      { path: "/settings/subscription" },
      { path: "/settings/partner-api" },
      { path: "/settings/logs" },
      { path: "/settings/bot" },
    ],
  },
  {
    key: "comunicacao",
    label: "11 — Comunicação / Talison",
    routes: [
      { path: "/communication" },
      { path: "/communication/send" },
      { path: "/communication/templates" },
    ],
  },
  {
    key: "fidelidade",
    label: "12 — Fidelidade",
    routes: [{ path: "/fidelidade" }],
  },
  {
    key: "catalogo",
    label: "13 — Catálogo / Ferramentas",
    routes: [
      { path: "/aparelhos-catalogo" },
      { path: "/simulator" },
      { path: "/valuations" },
      { path: "/imei" },
    ],
  },
  {
    key: "painel",
    label: "14 — Painel / Relatórios",
    routes: [{ path: "/painel" }, { path: "/reports" }],
  },
];

export function findModule(key: string): AuditModule | undefined {
  return AUDIT_MODULES.find((m) => m.key === key);
}
