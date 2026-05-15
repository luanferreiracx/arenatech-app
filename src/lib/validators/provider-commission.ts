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

export const COMMISSION_SCOPE_LABELS: Record<string, string> = {
  normal: "Normal",
  premium: "Premium",
};

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

// ── Commission Rule ──

export const providerRuleSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  category: z.string().min(1).max(40),
  scope: z.string().min(1).max(20),
  rangeMin: z.number().min(0),
  rangeMax: z.number().optional().nullable(),
  rate: z.number().min(0).max(100),
  _delete: z.boolean().optional(),
});
export type ProviderRuleInput = z.infer<typeof providerRuleSchema>;

export const updateProviderRulesSchema = z.object({
  contractId: z.string().uuid(),
  rules: z.array(providerRuleSchema).min(0),
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
