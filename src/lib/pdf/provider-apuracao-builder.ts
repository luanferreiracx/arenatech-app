import { withAdmin, withTenant } from "@/server/db";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { loadTenantHeader, formatDoc } from "@/lib/pdf/tenant-header";
import { ProviderApuracaoPdfDocument } from "@/lib/pdf/provider-apuracao-pdf";
import { APURACAO_STATUS_LABELS } from "@/lib/validators/provider-commission";
import {
  extractApuracaoLines,
  buildApuracaoCsv,
  type ApuracaoLine,
} from "@/lib/commission/apuracao-memory";

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
