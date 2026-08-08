import { z } from "zod";
import { MAX_BUSCA, MAX_DATA, MAX_LINHA } from "./limits";

// ── Enums ──

export const quickSaleStatusEnum = z.enum([
  "AWAITING_PAYMENT",
  "PAID",
  "CANCELLED",
  "REFUNDED",
  "EXPIRED",
]);
export type QuickSaleStatus = z.infer<typeof quickSaleStatusEnum>;

export const QUICK_SALE_STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: "Aguardando Pagamento",
  PAID: "Pago",
  CANCELLED: "Cancelado",
  REFUNDED: "Estornado",
  EXPIRED: "Expirado",
};

// ── Create Quick Sale ──

/**
 * QSL-1 (Etapa 9, M15): o desconto podia ser MAIOR que o subtotal.
 *
 * `unitPrice` já exigia `min(1)` ("Valor deve ser maior que zero") — a intenção
 * de não cobrar zero existia. O desconto furava a regra por outro caminho:
 * tela e servidor usavam `Math.max(0, subtotal - desconto)`, que **zera em
 * silêncio** em vez de recusar.
 *
 * Medido no navegador: 2 × R$ 100 com R$ 500 de desconto criou a venda
 * `QS202600001` com `total_amount = 0.00` e status `AWAITING_PAYMENT`. Só não
 * gerou o PIX porque a credencial local da Eulen é inválida — em produção teria
 * ido à API externa cobrar R$ 0,00.
 *
 * Produção está limpa hoje: 21 vendas, **0 zeradas**, menor valor R$ 2,00.
 */
function descontoNaoPodeZerarAVenda(
  v: { quantity?: number; unitPrice?: number; discount?: number },
  ctx: z.RefinementCtx,
) {
  if (v.quantity == null || v.unitPrice == null || v.discount == null) return;
  if (v.discount >= v.quantity * v.unitPrice) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discount"],
      message: "O desconto nao pode ser maior ou igual ao subtotal — a cobranca ficaria zerada.",
    });
  }
}

export const createQuickSaleSchema = z
  .object({
    buyerName: z.string().max(150).optional().nullable(),
    cpfCnpj: z.string().max(18).optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    productDescription: z.string().min(5, "Descricao deve ter no minimo 5 caracteres").max(2000),
    quantity: z.number().int().min(1, "Quantidade minima 1"),
    unitPrice: z.number().int().min(1, "Valor deve ser maior que zero"), // centavos
    discount: z.number().int().min(0).optional(), // centavos
  })
  .superRefine(descontoNaoPodeZerarAVenda);

export type CreateQuickSaleInput = z.infer<typeof createQuickSaleSchema>;

// ── Update Quick Sale ──

export const updateQuickSaleSchema = z.object({
  id: z.string().uuid(),
  buyerName: z.string().max(150).optional().nullable(),
  cpfCnpj: z.string().max(18).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  productDescription: z.string().min(5).max(2000).optional(),
  quantity: z.number().int().min(1).optional(),
  unitPrice: z.number().int().min(1).optional(), // centavos
  discount: z.number().int().min(0).optional(), // centavos
});

export type UpdateQuickSaleInput = z.infer<typeof updateQuickSaleSchema>;

// ── List Quick Sales ──

export const listQuickSalesSchema = z.object({
  status: quickSaleStatusEnum.optional(),
  search: z.string().max(MAX_BUSCA).optional(),
  dateFrom: z.string().max(MAX_DATA).optional(),
  dateTo: z.string().max(MAX_DATA).optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListQuickSalesInput = z.infer<typeof listQuickSalesSchema>;

// ── Generate PIX (DePix) ──

export const generateQuickSalePixSchema = z.object({
  id: z.string().uuid(),
  /** CPF/CNPJ informado pelo operador, obrigatorio quando totalAmount >= R$ 500. */
  taxId: z.string().max(20).optional().nullable(),
});

export type GenerateQuickSalePixInput = z.infer<typeof generateQuickSalePixSchema>;

// ── Check PIX status ──

export const checkQuickSalePixStatusSchema = z.object({
  id: z.string().uuid(),
  transactionId: z.string().max(MAX_LINHA).min(1),
  walletTransactionId: z.string().uuid().optional().nullable(),
});

export type CheckQuickSalePixStatusInput = z.infer<typeof checkQuickSalePixStatusSchema>;
