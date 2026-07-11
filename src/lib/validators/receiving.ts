import { z } from "zod";

// ── Enums ──

export const receivingAccountTypeEnum = z.enum(["CASH", "BANK", "PIX", "WALLET"]);
export type ReceivingAccountType = z.infer<typeof receivingAccountTypeEnum>;

export const cardKindEnum = z.enum(["CREDIT", "DEBIT"]);
export type CardKind = z.infer<typeof cardKindEnum>;

export const RECEIVING_ACCOUNT_TYPE_LABELS: Record<ReceivingAccountType, string> = {
  CASH: "Caixa",
  BANK: "Conta bancária",
  PIX: "Conta PIX",
  WALLET: "Carteira",
};

export const CARD_KIND_LABELS: Record<CardKind, string> = {
  CREDIT: "Crédito",
  DEBIT: "Débito",
};

// ── Receiving accounts ──

export const createReceivingAccountSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(100),
  type: receivingAccountTypeEnum,
  bankName: z.string().max(100).optional(),
  agency: z.string().max(20).optional(),
  accountNumber: z.string().max(30).optional(),
  pixKey: z.string().max(140).optional(),
  isDefault: z.boolean().optional(),
});

export const updateReceivingAccountSchema = createReceivingAccountSchema.partial().extend({
  id: z.string().uuid(),
});

// ── Acquirers ──

export const createAcquirerSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(100),
  // Conta de depósito é obrigatória: sem ela o recebível não sabe onde liquidar.
  receivingAccountId: z.string().uuid("Selecione a conta de depósito"),
});

export const updateAcquirerSchema = createAcquirerSchema.partial().extend({
  id: z.string().uuid(),
});

// ── Card brands ──

export const createCardBrandSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(60),
});

export const updateCardBrandSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60).optional(),
});

// ── Toggle (active) — compartilhado por conta/adquirente/bandeira ──

export const toggleActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});

// ── Acquirer rates (replace-all por adquirente) ──

export const acquirerRateRowSchema = z.object({
  cardBrandId: z.string().uuid(),
  kind: cardKindEnum,
  installments: z.number().int().min(1).max(36),
  feePercent: z.number().min(0).max(100),
  feeFixed: z.number().int().min(0).max(100_000_000), // centavos (teto R$1M — A2)
  settlementDays: z.number().int().min(0).max(180),
});

export const upsertAcquirerRatesSchema = z.object({
  acquirerId: z.string().uuid(),
  // Ao menos uma taxa: uma adquirente sem taxa não computa recebível/PDV.
  rates: z.array(acquirerRateRowSchema).min(1, "Cadastre ao menos uma taxa").max(500),
});

// ── Preview de liquidação (UI do PDV / config) ──

export const previewCardSettlementSchema = z.object({
  acquirerId: z.string().uuid(),
  cardBrandId: z.string().uuid(),
  kind: cardKindEnum,
  installments: z.number().int().min(1).max(36),
  grossCents: z.number().int().min(0).max(100_000_000),
});

/** Parcelas com taxa ativa cadastrada p/ um adquirente×bandeira×tipo (dropdown PDV). */
export const availableInstallmentsSchema = z.object({
  acquirerId: z.string().uuid(),
  cardBrandId: z.string().uuid(),
  kind: cardKindEnum,
});

/** Bandeiras com taxa ativa p/ um adquirente×tipo (dropdown de bandeira no PDV). */
export const availableBrandsSchema = z.object({
  acquirerId: z.string().uuid(),
  kind: cardKindEnum,
});

// ── Card receivables (listagem/visão) ──

export const cardReceivableStatusEnum = z.enum(["PENDING", "SETTLED", "CANCELLED"]);
export type CardReceivableStatus = z.infer<typeof cardReceivableStatusEnum>;

export const CARD_RECEIVABLE_STATUS_LABELS: Record<CardReceivableStatus, string> = {
  PENDING: "A receber",
  SETTLED: "Liquidado",
  CANCELLED: "Cancelado",
};

export const listCardReceivablesSchema = z.object({
  status: cardReceivableStatusEnum.default("PENDING"),
  acquirerId: z.string().uuid().optional(),
  dateFrom: z.string().optional(), // ISO date (expectedSettlementDate)
  dateTo: z.string().optional(),
  /** Só recebíveis liquidados com diferença ≠ 0 (relatório de divergências). */
  onlyDivergent: z.boolean().optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(200).default(50),
});

// ── Conciliação (settle / unsettle) ──

export const settleCardReceivablesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        /** Líquido REAL recebido (centavos). */
        settledNetCents: z.number().int().min(0).max(100_000_000),
      }),
    )
    .min(1)
    .max(200),
  /** Data em que o dinheiro caiu (ISO). Default = agora. */
  settledDate: z.string().optional(),
  /** Conta onde caiu. Default = a conta de depósito da adquirente. */
  accountId: z.string().uuid().optional().nullable(),
  note: z.string().max(500).optional(),
});

export const unsettleCardReceivablesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});
