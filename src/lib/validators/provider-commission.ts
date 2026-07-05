import { z } from "zod";

// ── Enums ──

export const providerProfileEnum = z.enum(["SELLER", "TECHNICIAN"]);
export type ProviderProfile = z.infer<typeof providerProfileEnum>;

export const providerBondTypeEnum = z.enum(["MEI", "CLT"]);
export type ProviderBondType = z.infer<typeof providerBondTypeEnum>;

export const apuracaoStatusEnum = z.enum(["OPEN", "CLOSED", "PAID", "CANCELLED"]);
export type ApuracaoStatus = z.infer<typeof apuracaoStatusEnum>;

export const reversalTypeEnum = z.enum([
  "RETURN_SAME_MONTH",
  "RETURN_LATER_MONTH",
  "CHARGEBACK_PROVIDER",
  "CHARGEBACK_FRAUD",
  "DEFAULT_60D",
  "WARRANTY_REFUND",
  "WARRANTY_PARTIAL",
  "MANUAL_ADJUSTMENT",
]);
export type ReversalType = z.infer<typeof reversalTypeEnum>;

// ── Labels ──

export const PROVIDER_PROFILE_LABELS: Record<string, string> = {
  SELLER: "Vendedor",
  TECHNICIAN: "Tecnico",
};

export const PROVIDER_BOND_TYPE_LABELS: Record<string, string> = {
  MEI: "MEI",
  CLT: "CLT",
};

export const APURACAO_STATUS_LABELS: Record<string, string> = {
  OPEN: "Aberta",
  CLOSED: "Fechada",
  PAID: "Paga",
  CANCELLED: "Cancelada",
};

export const APURACAO_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
  OPEN: "warning",
  CLOSED: "info",
  PAID: "success",
  CANCELLED: "destructive",
};

export const REVERSAL_TYPE_LABELS: Record<string, string> = {
  RETURN_SAME_MONTH: "Devolucao (mesmo mes)",
  RETURN_LATER_MONTH: "Devolucao (mes posterior)",
  CHARGEBACK_PROVIDER: "Chargeback — falha do prestador (100%)",
  CHARGEBACK_FRAUD: "Chargeback — fraude externa (50%)",
  DEFAULT_60D: "Inadimplencia > 60d",
  WARRANTY_REFUND: "Garantia com reembolso",
  WARRANTY_PARTIAL: "Garantia com prejuizo parcial",
  MANUAL_ADJUSTMENT: "Ajuste manual",
};

export const COMMISSION_CATEGORY_LABELS: Record<string, string> = {
  produto_acessorio: "Acessorio",
  produto_aparelho: "Aparelho",
  servico_at_sem_peca: "AT sem peca",
  servico_at_com_peca: "AT com peca",
  intermediacao_at: "Intermediacao",
};

export const commissionScopeEnum = z.enum(["normal", "premium"]);
export type CommissionScope = z.infer<typeof commissionScopeEnum>;

export const commissionCategoryEnum = z.enum([
  "produto_acessorio",
  "produto_aparelho",
  "servico_at_sem_peca",
  "servico_at_com_peca",
  "intermediacao_at",
]);
export type CommissionCategory = z.infer<typeof commissionCategoryEnum>;

export const COMMISSION_SCOPE_LABELS: Record<string, string> = {
  normal: "Normal",
  premium: "Premium",
};

/** Categorias que aceitam o eixo de escopo (normal/premium). Servicos/intermediacao
 *  sao sempre `normal` — o escopo premium so faz sentido para produtos. */
export const CATEGORIES_WITH_SCOPE: readonly CommissionCategory[] = [
  "produto_acessorio",
  "produto_aparelho",
];

// ── Create Provider ──

export const createProviderSchema = z.object({
  userId: z.string().uuid("ID do usuario obrigatorio"),
  profile: providerProfileEnum,
  bondType: providerBondTypeEnum,
  cpf: z.string().max(14).optional().nullable(),
  whatsapp: z.string().max(20).optional().nullable(),
  cnpjMei: z.string().max(20).optional().nullable(),
  razaoSocial: z.string().max(200).optional().nullable(),
  cnaePrincipal: z.string().max(20).optional().nullable(),
});
export type CreateProviderInput = z.infer<typeof createProviderSchema>;

// ── Update Provider ──

export const updateProviderSchema = z.object({
  id: z.string().uuid(),
  profile: providerProfileEnum.optional(),
  bondType: providerBondTypeEnum.optional(),
  cpf: z.string().max(14).optional().nullable(),
  whatsapp: z.string().max(20).optional().nullable(),
  cnpjMei: z.string().max(20).optional().nullable(),
  razaoSocial: z.string().max(200).optional().nullable(),
  cnaePrincipal: z.string().max(20).optional().nullable(),
  active: z.boolean().optional(),
});
export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;

// ── List Providers ──

export const listProvidersSchema = z.object({
  active: z.boolean().optional(),
  profile: providerProfileEnum.optional(),
  bondType: providerBondTypeEnum.optional(),
  search: z.string().optional(),
});
export type ListProvidersInput = z.infer<typeof listProvidersSchema>;

// ── Contract ──

export const createContractSchema = z.object({
  providerId: z.string().uuid(),
  startDate: z.string().min(1, "Data inicio obrigatoria"),
  endDate: z.string().optional().nullable(),
  allowanceCap: z.number().min(0).optional().nullable(),
  dailyMeal: z.number().min(0).optional().nullable(),
  dailyTransport: z.number().min(0).optional().nullable(),
  monthlyCellphone: z.number().min(0).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
export type CreateContractInput = z.infer<typeof createContractSchema>;

export const updateContractSchema = z.object({
  contractId: z.string().uuid(),
  startDate: z.string().min(1, "Data inicio obrigatoria"),
  endDate: z.string().optional().nullable(),
  allowanceCap: z.number().min(0).optional().nullable(),
  dailyMeal: z.number().min(0).optional().nullable(),
  dailyTransport: z.number().min(0).optional().nullable(),
  monthlyCellphone: z.number().min(0).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
export type UpdateContractInput = z.infer<typeof updateContractSchema>;

// ── Commission Rule ──

export const providerRuleSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  category: commissionCategoryEnum,
  scope: commissionScopeEnum,
  rangeMin: z.number().min(0),
  rangeMax: z.number().positive().optional().nullable(),
  rate: z.number().min(0).max(100),
  _delete: z.boolean().optional(),
});
export type ProviderRuleInput = z.infer<typeof providerRuleSchema>;

/**
 * Valida a integridade das faixas progressivas de uma categoria+escopo:
 * ordenadas por rangeMin, cada faixa comeca onde a anterior terminou (sem
 * buraco), sem sobreposicao, e apenas a ultima pode ser aberta (rangeMax null).
 * Aplicado tanto no cliente (RHF) quanto no server (defense in depth).
 */
export function validateBracketSet(
  rules: Array<{ rangeMin: number; rangeMax: number | null | undefined }>,
): { ok: true } | { ok: false; message: string } {
  if (rules.length === 0) return { ok: true };

  const sorted = [...rules].sort((a, b) => a.rangeMin - b.rangeMin);

  for (let i = 0; i < sorted.length; i++) {
    const rule = sorted[i]!;
    const isLast = i === sorted.length - 1;

    if (rule.rangeMax != null && rule.rangeMax <= rule.rangeMin) {
      return { ok: false, message: "O teto da faixa deve ser maior que o piso." };
    }
    if (rule.rangeMax == null && !isLast) {
      return { ok: false, message: "Apenas a ultima faixa pode ser aberta (sem teto)." };
    }
    if (!isLast) {
      const next = sorted[i + 1]!;
      if (rule.rangeMax !== next.rangeMin) {
        return {
          ok: false,
          message: "As faixas devem ser continuas (o teto de uma e o piso da seguinte), sem sobreposicao nem buraco.",
        };
      }
    }
  }

  return { ok: true };
}

export const updateProviderRulesSchema = z
  .object({
    contractId: z.string().uuid(),
    rules: z.array(providerRuleSchema).min(0),
  })
  .superRefine((data, ctx) => {
    // Agrupa por categoria|escopo e valida cada conjunto de faixas (ignora as marcadas para delete).
    const buckets = new Map<string, Array<{ rangeMin: number; rangeMax: number | null | undefined }>>();
    for (const rule of data.rules) {
      if (rule._delete) continue;
      const key = `${rule.category}|${rule.scope}`;
      const list = buckets.get(key) ?? [];
      list.push({ rangeMin: rule.rangeMin, rangeMax: rule.rangeMax });
      buckets.set(key, list);
    }
    for (const [key, list] of buckets) {
      const result = validateBracketSet(list);
      if (!result.ok) {
        const [category, scope] = key.split("|");
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rules"],
          message: `${COMMISSION_CATEGORY_LABELS[category!] ?? category} (${COMMISSION_SCOPE_LABELS[scope!] ?? scope}): ${result.message}`,
        });
      }
    }
  });
export type UpdateProviderRulesInput = z.infer<typeof updateProviderRulesSchema>;

// ── Apuracao ──

export const apurarProviderSchema = z.object({
  providerId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
});
export type ApurarProviderInput = z.infer<typeof apurarProviderSchema>;

export const closeApuracaoSchema = z.object({
  providerId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
});
export type CloseApuracaoInput = z.infer<typeof closeApuracaoSchema>;

// ── Reversals ──

export const createReversalSchema = z.object({
  providerId: z.string().uuid(),
  factDate: z.string().min(1, "Data obrigatoria"),
  type: reversalTypeEnum,
  amount: z.number().min(0.01, "Valor deve ser maior que zero"),
  description: z.string().max(300).optional().nullable(),
  referenceType: z.string().max(30).optional().nullable(),
  referenceId: z.string().uuid().optional().nullable(),
});
export type CreateReversalInput = z.infer<typeof createReversalSchema>;

export const deleteReversalSchema = z.object({
  id: z.string().uuid(),
  providerId: z.string().uuid(),
});
export type DeleteReversalInput = z.infer<typeof deleteReversalSchema>;

// ── Uncovered Days ──

export const toggleUncoveredDaySchema = z.object({
  providerId: z.string().uuid(),
  day: z.string().min(1, "Data obrigatoria"),
  reason: z.string().max(200).optional().nullable(),
});
export type ToggleUncoveredDayInput = z.infer<typeof toggleUncoveredDaySchema>;

// ── Get Provider Detail ──

export const getProviderDetailSchema = z.object({
  providerId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
});
export type GetProviderDetailInput = z.infer<typeof getProviderDetailSchema>;
