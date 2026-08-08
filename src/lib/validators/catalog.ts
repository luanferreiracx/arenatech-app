import { z } from "zod";
import { MAX_BUSCA, MAX_NOME, MAX_TEXTO_LONGO } from "./limits";

// ── Service schemas ──

/**
 * Tipo de servico: a UI manda o ID da entidade (`serviceTypeId`) ou o nome de um
 * tipo novo (`newServiceTypeName`, criacao inline). `serviceType` texto so
 * sobrevive como fallback para chamadas antigas — o resolver trata os tres.
 * Espelha o cadastro de marca do produto. Auditoria 2026-07-25, item 17.
 */
const serviceTypeSelection = {
  serviceTypeId: z.string().uuid().nullish(),
  newServiceTypeName: z.string().min(2, "Nome do tipo muito curto").max(100).nullish(),
  serviceType: z.string().max(255).nullish(),
};

export const createServiceSchema = z.object({
  ...serviceTypeSelection,
  deviceModel: z.string().min(1, "Modelo do aparelho obrigatorio").max(255),
  description: z.string().max(2000).optional(),
  basePrice: z.number().int().min(0, "Preco deve ser positivo"), // centavos
  estimatedTime: z.string().max(100).optional(),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z.object({
  id: z.string().uuid(),
  ...serviceTypeSelection,
  deviceModel: z.string().min(1, "Modelo do aparelho obrigatorio").max(255),
  description: z.string().max(2000).optional(),
  basePrice: z.number().int().min(0, "Preco deve ser positivo"), // centavos
  estimatedTime: z.string().max(100).optional(),
});

export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const listServicesSchema = z.object({
  search: z.string().max(MAX_BUSCA).optional(),
  serviceTypeId: z.string().uuid().optional(),
  deviceModel: z.string().max(MAX_NOME).optional(),
  active: z.boolean().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type ListServicesInput = z.infer<typeof listServicesSchema>;

export const bulkAdjustSchema = z.object({
  serviceTypeId: z.string().uuid(),
  // Teto sanitário de R$ 100.000 por reajuste (auditoria 2026-07-25). Antes era
  // `z.number().int()` sem limite: um dedo errado (ou um zero a mais) reajustava
  // TODOS os serviços do tipo em qualquer valor. O preço do serviço é a base da
  // OS e da comissão do prestador, e vai no orçamento enviado ao cliente.
  // A irmã `bulkAdjustPrices` (percentual) já tinha `.min(-100).max(1000)`.
  adjustmentCents: z
    .number()
    .int()
    .min(-10_000_000, "Reajuste fora do limite permitido (R$ 100.000)")
    .max(10_000_000, "Reajuste fora do limite permitido (R$ 100.000)"), // positive = increase, negative = decrease
});

export type BulkAdjustInput = z.infer<typeof bulkAdjustSchema>;

export const sendServiceWhatsAppSchema = z.object({
  serviceId: z.string().uuid(),
  clientName: z.string().min(1, "Nome do cliente obrigatorio").max(255),
  clientPhone: z.string().min(10, "Telefone invalido").max(20),
});

export type SendServiceWhatsAppInput = z.infer<typeof sendServiceWhatsAppSchema>;

// ── ServiceObservation schemas ──

export const createServiceObservationSchema = z.object({
  title: z.string().min(1, "Titulo obrigatorio").max(100),
  observation: z.string().max(MAX_TEXTO_LONGO).min(1, "Observacao obrigatoria"),
  serviceTypes: z.array(z.string()).optional().nullable(),
  deviceModels: z.array(z.string()).optional().nullable(),
});
export type CreateServiceObservationInput = z.infer<typeof createServiceObservationSchema>;

export const updateServiceObservationSchema = createServiceObservationSchema.extend({
  id: z.string().uuid(),
});
export type UpdateServiceObservationInput = z.infer<typeof updateServiceObservationSchema>;

export const listServiceObservationsSchema = z.object({
  active: z.boolean().optional(),
  serviceType: z.string().max(MAX_NOME).optional(),
  deviceModel: z.string().max(MAX_NOME).optional(),
});
export type ListServiceObservationsInput = z.infer<typeof listServiceObservationsSchema>;

// ═══════════════════════════════════════
// CONDIÇÃO DO APARELHO (catálogo)
// ═══════════════════════════════════════

/**
 * CAT-2 (Etapa 9, M12): "Condição" era `Input` de texto livre, e o resultado em
 * produção foi previsível — **"novo" (18) e "Novo" (2) como valores distintos**,
 * mais 2 "Seminovo" e 1 vazio. O cliente vê a mesma condição escrita de duas
 * formas, e nenhum agrupamento por condição funciona.
 *
 * Lista fechada, ordenada do melhor estado para o pior (é como o cliente pensa
 * ao comparar). O valor persistido é o próprio rótulo — o dado legado só precisa
 * de normalização de caixa, não de mapa de conversão.
 */
export const DEVICE_CONDITIONS = ["Novo", "Seminovo", "Usado", "Vitrine"] as const;

export type DeviceCondition = (typeof DEVICE_CONDITIONS)[number];

/**
 * Aceita o legado em qualquer caixa ("novo" → "Novo") e recusa o que não estiver
 * na lista. `null`/vazio continua válido: condição é opcional.
 */
export const deviceConditionSchema = z
  .string()
  .trim()
  .transform((valor) => {
    if (valor === "") return null;
    const achado = DEVICE_CONDITIONS.find(
      (c) => c.toLowerCase() === valor.toLowerCase(),
    );
    return achado ?? valor;
  })
  .refine((valor) => valor === null || DEVICE_CONDITIONS.includes(valor as DeviceCondition), {
    message: `Condicao deve ser uma de: ${DEVICE_CONDITIONS.join(", ")}`,
  })
  .nullable()
  .optional();
