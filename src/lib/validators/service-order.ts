import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Checklist schemas (JSONB — redesign of 30 individual Laravel columns)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Checklist value: true = OK, false = Não OK, null = N/A (não se aplica / não testado)
 * All fields are optional — when absent, treated as "not tested".
 */
export const checklistValueSchema = z.boolean().nullable().optional();

export const checklistSchema = z.object({
  powerOn: checklistValueSchema,
  vibration: checklistValueSchema,
  buttons: checklistValueSchema,
  bluetooth: checklistValueSchema,
  wifi: checklistValueSchema,
  backGlass: checklistValueSchema,
  audio: checklistValueSchema,
  microphone: checklistValueSchema,
  cameras: checklistValueSchema,
  touchFaceId: checklistValueSchema,
  charging: checklistValueSchema,
  screen: checklistValueSchema,
  cableCharging: checklistValueSchema,
  wirelessCharging: checklistValueSchema,
  magSafe: checklistValueSchema,
});

export type ChecklistInput = z.infer<typeof checklistSchema>;

export const CHECKLIST_LABELS: Record<string, string> = {
  powerOn: "Aparelho liga",
  vibration: "Aparelho vibra",
  buttons: "Botões OK",
  bluetooth: "Bluetooth OK",
  wifi: "WiFi OK",
  backGlass: "Vidro traseiro OK",
  audio: "Áudio OK",
  microphone: "Microfone OK",
  cameras: "Câmeras/Flash OK",
  touchFaceId: "Touch/FaceID OK",
  charging: "Aparelho carrega",
  screen: "Tela frontal OK",
  cableCharging: "Carregamento cabo",
  wirelessCharging: "Carregamento indução",
  magSafe: "Imã/MagSafe",
};

export const deviceInfoSchema = z.object({
  waterDamage: z.boolean().optional(),
  noOriginalCharger: z.boolean().optional(),
  dropDamage: z.boolean().optional(),
  hiddenProblems: z.boolean().optional(),
  recentOtherRepair: z.boolean().optional(),
  simChipReturned: z.boolean().optional(),
});

export type DeviceInfoInput = z.infer<typeof deviceInfoSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Warranty type enum (mirrors Laravel: retorno_servico, produto_vendido, fabricante)
// ────────────────────────────────────────────────────────────────────────────

export const WARRANTY_TYPES = ["retorno_servico", "produto_vendido", "fabricante"] as const;
export type WarrantyType = (typeof WARRANTY_TYPES)[number];

export const WARRANTY_TYPE_LABELS: Record<WarrantyType, string> = {
  retorno_servico: "Retorno de Serviço",
  produto_vendido: "Produto Vendido",
  fabricante: "Fabricante",
};

export const DEVICE_INFO_LABELS: Record<string, string> = {
  waterDamage: "Aparelho molhou",
  noOriginalCharger: "Não usa fonte original",
  dropDamage: "Aparelho sofreu queda",
  hiddenProblems: "Problemas ocultos",
  recentOtherRepair: "Outra assistência recente",
  simChipReturned: "Acessórios/chip devolvidos",
};

// ────────────────────────────────────────────────────────────────────────────
// Service Order Item
// ────────────────────────────────────────────────────────────────────────────

export const serviceOrderItemSchema = z.object({
  type: z.enum(["SERVICE", "PRODUCT"]),
  serviceId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  description: z.string().min(1, "Descrição obrigatória"),
  quantity: z.number().positive("Quantidade deve ser positiva"),
  unitPrice: z.number().min(0, "Preço unitário não pode ser negativo"),
  costPrice: z.number().min(0).optional(),
});

export type ServiceOrderItemInput = z.infer<typeof serviceOrderItemSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Create Service Order (wizard)
// ────────────────────────────────────────────────────────────────────────────

export const createServiceOrderSchema = z.object({
  // Step 1: Customer
  customerId: z.string().uuid("Cliente obrigatório"),
  // Step 2: Device
  deviceType: z.string().optional(),
  deviceBrand: z.string().optional(),
  deviceModel: z.string().optional(),
  serialNumber: z.string().optional(),
  imei: z.string().optional(),
  devicePassword: z.string().optional(),
  // Step 3: Problem + Checklist
  reportedProblem: z.string().min(1, "Problema relatado é obrigatório"),
  entryChecklist: checklistSchema.optional(),
  deviceInfo: deviceInfoSchema.optional(),
  // Step 4: Items
  items: z.array(serviceOrderItemSchema),
  // Step 5: Summary
  discount: z.number().min(0).optional(),
  estimatedDate: z.string().datetime().optional(),
  technicianId: z.string().uuid().optional(),
  isWarranty: z.boolean().optional(),
  warrantyType: z.enum(WARRANTY_TYPES).optional(),
  warrantyMonths: z.number().int().min(0).max(120).optional(),
  originalOrderId: z.string().uuid().optional(),
  internalNotes: z.string().optional(),
  customerNotes: z.string().optional(),
});

export type CreateServiceOrderInput = z.infer<typeof createServiceOrderSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Update Service Order (data only — not status)
// ────────────────────────────────────────────────────────────────────────────

export const updateServiceOrderSchema = z.object({
  deviceType: z.string().optional(),
  deviceBrand: z.string().optional(),
  deviceModel: z.string().optional(),
  serialNumber: z.string().optional(),
  imei: z.string().optional(),
  devicePassword: z.string().optional(),
  reportedProblem: z.string().optional(),
  diagnosedProblem: z.string().optional(),
  entryChecklist: checklistSchema.optional(),
  exitChecklist: checklistSchema.optional(),
  deviceInfo: deviceInfoSchema.optional(),
  discount: z.number().min(0).optional(),
  estimatedDate: z.string().datetime().optional().nullable(),
  technicianId: z.string().uuid().optional().nullable(),
  isWarranty: z.boolean().optional(),
  warrantyType: z.enum(WARRANTY_TYPES).optional().nullable(),
  warrantyMonths: z.number().int().min(0).max(120).optional().nullable(),
  originalOrderId: z.string().uuid().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  customerNotes: z.string().optional().nullable(),
});

export type UpdateServiceOrderInput = z.infer<typeof updateServiceOrderSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Status transitions
// ────────────────────────────────────────────────────────────────────────────

export const SERVICE_ORDER_STATUSES = [
  "OPEN",
  "IN_DIAGNOSIS",
  "WAITING_APPROVAL",
  "APPROVED",
  "WAITING_PARTS",
  "IN_PROGRESS",
  "COMPLETED",
  "PAID",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "IN_WARRANTY",
  "CANCELLED",
  "REFUNDED",
] as const;

export type ServiceOrderStatusValue = (typeof SERVICE_ORDER_STATUSES)[number];

export const ALLOWED_TRANSITIONS: Record<ServiceOrderStatusValue, ServiceOrderStatusValue[]> = {
  OPEN: ["IN_DIAGNOSIS", "CANCELLED"],
  IN_DIAGNOSIS: ["WAITING_APPROVAL", "APPROVED", "CANCELLED"],
  WAITING_APPROVAL: ["APPROVED", "CANCELLED"],
  APPROVED: ["WAITING_PARTS", "IN_PROGRESS", "CANCELLED"],
  WAITING_PARTS: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "WAITING_PARTS", "CANCELLED"],
  COMPLETED: ["PAID", "CANCELLED"],
  PAID: ["READY_FOR_PICKUP", "DELIVERED", "REFUNDED"],
  READY_FOR_PICKUP: ["DELIVERED", "REFUNDED"],
  DELIVERED: ["IN_WARRANTY"],
  IN_WARRANTY: ["OPEN"],
  CANCELLED: [],
  REFUNDED: [],
};

export const STATUS_LABELS: Record<ServiceOrderStatusValue, string> = {
  OPEN: "Aberta",
  IN_DIAGNOSIS: "Em Diagnóstico",
  WAITING_APPROVAL: "Aguardando Aprovação",
  APPROVED: "Aprovada",
  WAITING_PARTS: "Aguardando Peças",
  IN_PROGRESS: "Em Execução",
  COMPLETED: "Concluída",
  PAID: "Paga",
  READY_FOR_PICKUP: "Pronta p/ Retirada",
  DELIVERED: "Entregue",
  IN_WARRANTY: "Em Garantia",
  CANCELLED: "Cancelada",
  REFUNDED: "Estornada",
};

export const STATUS_VARIANTS: Record<ServiceOrderStatusValue, "default" | "success" | "warning" | "destructive" | "info"> = {
  OPEN: "info",
  IN_DIAGNOSIS: "warning",
  WAITING_APPROVAL: "warning",
  APPROVED: "info",
  WAITING_PARTS: "warning",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  PAID: "success",
  READY_FOR_PICKUP: "success",
  DELIVERED: "success",
  IN_WARRANTY: "warning",
  CANCELLED: "destructive",
  REFUNDED: "destructive",
};

export const updateStatusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(SERVICE_ORDER_STATUSES),
  notes: z.string().optional(),
  // Required for specific transitions
  cancellationReason: z.string().optional(),
  refundReason: z.string().optional(),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

// ────────────────────────────────────────────────────────────────────────────
// List filters
// ────────────────────────────────────────────────────────────────────────────

export const listServiceOrdersSchema = z.object({
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
  search: z.string().optional(),
  status: z.enum(SERVICE_ORDER_STATUSES).optional(),
  technicianId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ListServiceOrdersInput = z.infer<typeof listServiceOrdersSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Add/Update items
// ────────────────────────────────────────────────────────────────────────────

export const addItemSchema = z.object({
  orderId: z.string().uuid(),
  type: z.enum(["SERVICE", "PRODUCT"]),
  serviceId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  description: z.string().min(1, "Descrição obrigatória"),
  quantity: z.number().positive("Quantidade deve ser positiva"),
  unitPrice: z.number().min(0, "Preço unitário não pode ser negativo"),
  costPrice: z.number().min(0).optional(),
});

export type AddItemInput = z.infer<typeof addItemSchema>;

export const updateItemSchema = z.object({
  itemId: z.string().uuid(),
  description: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
});

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Payment
// ────────────────────────────────────────────────────────────────────────────

export const registerPaymentSchema = z.object({
  orderId: z.string().uuid(),
  paymentMethod: z.string().min(1, "Forma de pagamento obrigatória"),
  paidAmount: z.number().min(0.01, "Valor pago deve ser maior que zero"),
  paymentDiscount: z.number().min(0).optional(),
  paymentNotes: z.string().optional(),
});

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Documents
// ────────────────────────────────────────────────────────────────────────────

export const addDocumentSchema = z.object({
  orderId: z.string().uuid(),
  type: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  mimeType: z.string().optional(),
  size: z.number().int().optional(),
});

export type AddDocumentInput = z.infer<typeof addDocumentSchema>;
