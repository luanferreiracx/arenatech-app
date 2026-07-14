import { withAdmin, withTenant } from "@/server/db";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { loadTenantHeader, formatDoc } from "@/lib/pdf/tenant-header";
import { ProviderApuracaoPdfDocument } from "@/lib/pdf/provider-apuracao-pdf";
import {
  APURACAO_STATUS_LABELS,
  COMMISSION_CATEGORY_LABELS,
  COMMISSION_SCOPE_LABELS,
  COMMISSION_SOURCE_LABELS,
} from "@/lib/validators/provider-commission";
import {
  extractApuracaoLines,
  buildApuracaoCsv,
  type ApuracaoLine,
} from "@/lib/commission/apuracao-memory";
import { computeCommissionPreview } from "@/server/services/commission-preview.service";
import { startOfDayBrt, endOfDayBrt } from "@/lib/utils/date-range";
import { formatBrDate } from "@/lib/utils/format-br-date";

export type ApuracaoExport = {
  providerName: string;
  monthLabel: string;
  status: string;
  summary: {
    grossCommission: number;
    totalReversals: number;
    totalAllowance: number;
    netAmount: number;
  };
  lines: ApuracaoLine[];
};

function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Carrega a apuracao de um prestador (tenant-scoped) e monta os dados de export.
 * Retorna null se a apuracao nao existe. Compartilhado pelas rotas de PDF e CSV.
 */
export async function loadApuracaoExport(
  tenantId: string,
  providerId: string,
  year: number,
  month: number,
): Promise<ApuracaoExport | null> {
  const apuracao = await withTenant(tenantId, (tx) =>
    tx.providerApuracao.findFirst({
      where: { providerId, year, month },
    }),
  );
  if (!apuracao) return null;

  const provider = await withTenant(tenantId, (tx) =>
    tx.provider.findUnique({ where: { id: providerId }, select: { userId: true } }),
  );
  const providerName = provider
    ? (await withAdmin((tx) =>
        tx.user.findUnique({ where: { id: provider.userId }, select: { name: true } }),
      ))?.name ?? "Prestador"
    : "Prestador";

  return {
    providerName,
    monthLabel: `${String(month).padStart(2, "0")}/${year}`,
    status: APURACAO_STATUS_LABELS[apuracao.status] ?? apuracao.status,
    summary: {
      grossCommission: toNumber(apuracao.grossCommission),
      totalReversals: toNumber(apuracao.totalReversals),
      totalAllowance: toNumber(apuracao.totalAllowance),
      netAmount: toNumber(apuracao.netAmount),
    },
    lines: extractApuracaoLines(apuracao.memoryJson),
  };
}

/** Gera o PDF da apuracao. Retorna null se a apuracao nao existe. */
export async function buildProviderApuracaoPdf(
  tenantId: string,
  providerId: string,
  year: number,
  month: number,
): Promise<Buffer | null> {
  const data = await loadApuracaoExport(tenantId, providerId, year, month);
  if (!data) return null;

  const header = await loadTenantHeader(tenantId);

  return renderPdfToBuffer(
    ProviderApuracaoPdfDocument({
      store: {
        name: header.storeName,
        cnpj: formatDoc(header.cnpj),
        phone: header.phone,
        address: header.address,
        logoDataUrl: header.logoDataUrl,
      },
      providerName: data.providerName,
      monthLabel: data.monthLabel,
      status: data.status,
      summary: data.summary,
      lines: data.lines,
    }),
  );
}

/** Gera o CSV da memoria de calculo. Retorna null se a apuracao nao existe. */
export async function buildProviderApuracaoCsv(
  tenantId: string,
  providerId: string,
  year: number,
  month: number,
): Promise<string | null> {
  const data = await loadApuracaoExport(tenantId, providerId, year, month);
  if (!data) return null;
  return buildApuracaoCsv(data.lines);
}

// ═══════════════════════════════════════
// Previa por periodo livre (so comissao)
// ═══════════════════════════════════════

export type PeriodCommissionExport = {
  providerName: string;
  periodLabel: string; // "01/07/2026 a 13/07/2026"
  grossCommission: number;
  lines: ApuracaoLine[];
};

/**
 * Carrega a previa de comissao por periodo LIVRE (so comissao, sem ajuda de
 * custo nem estornos, sem persistir). `startDate`/`endDate` em `YYYY-MM-DD`.
 * Compartilhado pela rota de PDF por periodo.
 */
export async function loadPeriodCommissionExport(
  tenantId: string,
  providerId: string,
  startDate: string,
  endDate: string,
): Promise<PeriodCommissionExport | null> {
  const provider = await withTenant(tenantId, (tx) =>
    tx.provider.findUnique({ where: { id: providerId }, select: { userId: true } }),
  );
  if (!provider) return null;

  const providerName =
    (await withAdmin((tx) =>
      tx.user.findUnique({ where: { id: provider.userId }, select: { name: true } }),
    ))?.name ?? "Prestador";

  const preview = await withTenant(tenantId, (tx) =>
    computeCommissionPreview(tx, providerId, startOfDayBrt(startDate), endOfDayBrt(endDate)),
  );

  const lines: ApuracaoLine[] = preview.lines.map((l) => ({
    data: l.data,
    referencia: l.referencia_label,
    categoria: COMMISSION_CATEGORY_LABELS[l.categoria] ?? l.categoria,
    escopo: COMMISSION_SCOPE_LABELS[l.escopo] ?? l.escopo,
    origem: COMMISSION_SOURCE_LABELS[l.origem] ?? l.origem,
    base: l.base,
    comissao: l.comissao,
  }));

  return {
    providerName,
    periodLabel: `${formatBrDate(startDate)} a ${formatBrDate(endDate)}`,
    grossCommission: preview.grossCommission,
    lines,
  };
}

/** Gera o PDF da previa de comissao por periodo livre (so comissao). */
export async function buildProviderPeriodCommissionPdf(
  tenantId: string,
  providerId: string,
  startDate: string,
  endDate: string,
): Promise<Buffer | null> {
  const data = await loadPeriodCommissionExport(tenantId, providerId, startDate, endDate);
  if (!data) return null;

  const header = await loadTenantHeader(tenantId);

  return renderPdfToBuffer(
    ProviderApuracaoPdfDocument({
      store: {
        name: header.storeName,
        cnpj: formatDoc(header.cnpj),
        phone: header.phone,
        address: header.address,
        logoDataUrl: header.logoDataUrl,
      },
      providerName: data.providerName,
      docLabel: "Comissao por periodo",
      monthLabel: data.periodLabel,
      // Sem status/estornos/ajuda de custo: previa e so comissao.
      summary: { grossCommission: data.grossCommission },
      lines: data.lines,
    }),
  );
}
