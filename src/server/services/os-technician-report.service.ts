import { startOfDayBrt, endOfDayBrt } from "@/lib/utils/date-range";
import { withTenant, withAdmin } from "@/server/db";

// `any` para suportar PrismaClient e tx de withTenant — padrao do repo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = any;

export interface TechnicianReportInput {
  dateFrom?: string;
  dateTo?: string;
  /** Filtro por técnico interno (user). Exclusivo com `serviceProviderId`. */
  technicianId?: string;
  /** Filtro por prestador externo que atua como técnico. */
  serviceProviderId?: string;
}

export interface TechnicianReportItem {
  /**
   * Chave única da linha. Para técnico interno é o `user.id`; para prestador é o
   * `service_provider.id`; para OS sem responsável é `__unassigned__`. Use junto
   * com `kind` para distinguir a origem.
   */
  technicianId: string;
  kind: "user" | "provider" | "none";
  technicianName: string;
  totalOs: number;
  completed: number;
  cancelled: number;
  serviceValue: number; // centavos
  partsValue: number;
  totalValue: number;
  partsCost: number;
  otherCost: number;
  profit: number;
  ticketMedio: number;
  avgDays: number | null;
}

export interface TechnicianReportTotals {
  totalOs: number;
  completed: number;
  cancelled: number;
  serviceValue: number;
  partsValue: number;
  totalValue: number;
  partsCost: number;
  otherCost: number;
  profit: number;
}

const COUNTED_AS_COMPLETED = new Set(["COMPLETED", "PAID", "READY_FOR_PICKUP", "DELIVERED"]);
const EXCLUDED_FROM_FINANCIALS = new Set(["CANCELLED", "REFUNDED"]);

/**
 * Agrega o relatorio de tecnicos. Compartilhado entre o procedure `technicianReport`
 * e a rota `/api/service-orders/technician-report/pdf` para garantir os mesmos
 * numeros nos dois lugares (antes a logica era duplicada com pequenas diferencas
 * de arredondamento entre tela e PDF).
 *
 * Regras (paridade Laravel `relatorioTecnicos`):
 *  - exclui OS soft-deleted (`deletedAt: null`);
 *  - filtra por `entryDate` (data de entrada da OS), nao `createdAt`;
 *  - `completed` count = COMPLETED + PAID + READY_FOR_PICKUP + DELIVERED;
 *  - valores financeiros (receita/custos/lucro/ticket) excluem CANCELLED e REFUNDED;
 *  - o técnico responsável da OS pode ser um usuário interno (`technicianId`) OU
 *    um prestador externo (`serviceProviderId`) — ambos viram linhas próprias,
 *    cada um com seu nome. OS sem nenhum responsável aparece como "Sem técnico".
 */
export async function buildTechnicianReport(
  tx: TxClient,
  tenantId: string,
  input: TechnicianReportInput,
): Promise<{ items: TechnicianReportItem[]; totals: TechnicianReportTotals }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId, deletedAt: null };
  if (input.dateFrom || input.dateTo) {
    where.entryDate = {};
    if (input.dateFrom) where.entryDate.gte = startOfDayBrt(input.dateFrom);
    if (input.dateTo) where.entryDate.lte = endOfDayBrt(input.dateTo);
  }
  // Filtro de responsável é exclusivo: técnico interno OU prestador externo.
  if (input.technicianId) where.technicianId = input.technicianId;
  else if (input.serviceProviderId) where.serviceProviderId = input.serviceProviderId;

  const orders = await tx.serviceOrder.findMany({
    where,
    select: {
      id: true,
      technicianId: true,
      serviceProviderId: true,
      status: true,
      serviceAmount: true,
      partsAmount: true,
      totalAmount: true,
      partsCost: true,
      otherCost: true,
      entryDate: true,
      completedDate: true,
    },
    // Safety cap — sem isso um tenant grande poderia carregar centenas de
    // milhares de linhas na memoria. 50k cobre folgado um ano de operacao.
    take: 50_000,
  });

  type Entry = {
    // Id bruto da entidade (user.id ou service_provider.id), ou null se sem responsável.
    entityId: string | null;
    kind: "user" | "provider" | "none";
    totalOs: number;
    completed: number;
    cancelled: number;
    serviceValue: number;
    partsValue: number;
    totalValue: number;
    partsCost: number;
    otherCost: number;
    totalDays: number;
    completedCount: number;
  };
  // Chave composta evita colisão entre user e prestador no mesmo Map.
  const byTech = new Map<string, Entry>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of orders as any[]) {
    const kind: Entry["kind"] = o.technicianId ? "user" : o.serviceProviderId ? "provider" : "none";
    const entityId: string | null = o.technicianId ?? o.serviceProviderId ?? null;
    const key = entityId ? `${kind}:${entityId}` : "__unassigned__";
    let e = byTech.get(key);
    if (!e) {
      e = {
        entityId, kind,
        totalOs: 0, completed: 0, cancelled: 0,
        serviceValue: 0, partsValue: 0, totalValue: 0,
        partsCost: 0, otherCost: 0,
        totalDays: 0, completedCount: 0,
      };
      byTech.set(key, e);
    }
    e.totalOs++;
    if (COUNTED_AS_COMPLETED.has(o.status)) e.completed++;
    if (o.status === "CANCELLED") e.cancelled++;
    // Valores financeiros: somente status efetivamente faturados.
    if (!EXCLUDED_FROM_FINANCIALS.has(o.status)) {
      e.serviceValue += Number(o.serviceAmount ?? 0);
      e.partsValue += Number(o.partsAmount ?? 0);
      e.totalValue += Number(o.totalAmount ?? 0);
      e.partsCost += Number(o.partsCost ?? 0);
      e.otherCost += Number(o.otherCost ?? 0);
    }
    if (o.completedDate && o.entryDate) {
      const days = (o.completedDate.getTime() - o.entryDate.getTime()) / (1000 * 60 * 60 * 24);
      e.totalDays += days;
      e.completedCount++;
    }
  }

  const entries = [...byTech.values()];
  const userIds = entries.filter((e) => e.kind === "user" && e.entityId).map((e) => e.entityId!);
  const providerIds = entries.filter((e) => e.kind === "provider" && e.entityId).map((e) => e.entityId!);

  // Nomes de usuários internos (cross-tenant via admin) e prestadores (tenant-scoped).
  // Inclui prestadores soft-deleted: OS antigas devem manter o nome de quem executou.
  const [users, providers] = await Promise.all([
    userIds.length
      ? withAdmin(async (adminTx) =>
          adminTx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
        )
      : Promise.resolve([] as { id: string; name: string }[]),
    providerIds.length
      ? tx.serviceProvider.findMany({ where: { id: { in: providerIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const userNames = new Map(users.map((u) => [u.id, u.name]));
  const providerNames = new Map(providers.map((p: { id: string; name: string }) => [p.id, p.name]));

  const resolveName = (e: { kind: "user" | "provider" | "none"; entityId: string | null }): string => {
    if (e.kind === "none" || !e.entityId) return "Sem técnico";
    if (e.kind === "provider") {
      const name = providerNames.get(e.entityId);
      return name ? `${name} (prestador)` : "Prestador removido";
    }
    return userNames.get(e.entityId) ?? "Usuário removido";
  };

  const items: TechnicianReportItem[] = entries
    .map((e) => {
      const profit = e.totalValue - e.partsCost - e.otherCost;
      const ticketMedio = e.completed > 0 ? e.totalValue / e.completed : 0;
      const avgDays = e.completedCount > 0
        ? Math.round((e.totalDays / e.completedCount) * 10) / 10
        : null;
      return {
        technicianId: e.entityId ?? "__unassigned__",
        kind: e.kind,
        technicianName: resolveName(e),
        totalOs: e.totalOs,
        completed: e.completed,
        cancelled: e.cancelled,
        serviceValue: Math.round(e.serviceValue * 100),
        partsValue: Math.round(e.partsValue * 100),
        totalValue: Math.round(e.totalValue * 100),
        partsCost: Math.round(e.partsCost * 100),
        otherCost: Math.round(e.otherCost * 100),
        profit: Math.round(profit * 100),
        ticketMedio: Math.round(ticketMedio * 100),
        avgDays,
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue);

  const totals: TechnicianReportTotals = items.reduce(
    (acc, i) => {
      acc.totalOs += i.totalOs;
      acc.completed += i.completed;
      acc.cancelled += i.cancelled;
      acc.serviceValue += i.serviceValue;
      acc.partsValue += i.partsValue;
      acc.totalValue += i.totalValue;
      acc.partsCost += i.partsCost;
      acc.otherCost += i.otherCost;
      acc.profit += i.profit;
      return acc;
    },
    {
      totalOs: 0, completed: 0, cancelled: 0,
      serviceValue: 0, partsValue: 0, totalValue: 0,
      partsCost: 0, otherCost: 0, profit: 0,
    },
  );

  return { items, totals };
}

/** Conveniencia para callers HTTP que ainda nao tem uma tx aberta. */
export async function buildTechnicianReportWithTenant(
  tenantId: string,
  input: TechnicianReportInput,
): Promise<{ items: TechnicianReportItem[]; totals: TechnicianReportTotals }> {
  return withTenant(tenantId, (tx) => buildTechnicianReport(tx, tenantId, input));
}
