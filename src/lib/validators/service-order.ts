import { z } from "zod";

// ── Enums ──

export const serviceOrderStatusEnum = z.enum([
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
]);
export type ServiceOrderStatus = z.infer<typeof serviceOrderStatusEnum>;

export const SERVICE_ORDER_STATUS_LABELS: Record<ServiceOrderStatus, string> = {
  OPEN: "Iniciada",
  IN_DIAGNOSIS: "Em Diagnostico",
  WAITING_APPROVAL: "Aguard. Aprovacao",
  APPROVED: "Aprovada",
  WAITING_PARTS: "Aguard. Pecas",
  IN_PROGRESS: "Em Execucao",
  COMPLETED: "Concluida",
  PAID: "Paga",
  READY_FOR_PICKUP: "Aguard. Retirada",
  DELIVERED: "Entregue",
  IN_WARRANTY: "Em Garantia",
  CANCELLED: "Cancelada",
  REFUNDED: "Estornada",
};

/**
 * Mapping de cada status para um nome de icone lucide-react.
 * Espelha o `$statusConfig` do Laravel (FA → lucide equivalente).
 * Os componentes consumidores fazem import dinamico desses icones.
 */
export const SERVICE_ORDER_STATUS_ICON: Record<ServiceOrderStatus, string> = {
  OPEN: "PlayCircle",          // fa-play-circle
  IN_DIAGNOSIS: "Search",       // fa-search
  WAITING_APPROVAL: "Clock",    // fa-clock
  APPROVED: "CheckCircle2",     // fa-check-circle
  WAITING_PARTS: "Package",     // fa-box
  IN_PROGRESS: "Wrench",        // fa-tools
  COMPLETED: "CheckCheck",      // fa-check-double
  PAID: "DollarSign",           // fa-dollar-sign
  READY_FOR_PICKUP: "Clock",    // fa-clock
  DELIVERED: "Handshake",       // fa-handshake
  IN_WARRANTY: "ShieldCheck",   // fa-shield-alt
  CANCELLED: "XCircle",         // fa-times-circle
  REFUNDED: "Undo2",            // fa-undo-alt
};

export const SERVICE_ORDER_STATUS_VARIANT: Record<ServiceOrderStatus, "default" | "success" | "warning" | "destructive" | "info"> = {
  OPEN: "default",
  IN_DIAGNOSIS: "info",
  WAITING_APPROVAL: "warning",
  APPROVED: "success",
  WAITING_PARTS: "warning",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  PAID: "success",
  READY_FOR_PICKUP: "warning",
  DELIVERED: "success",
  IN_WARRANTY: "info",
  CANCELLED: "destructive",
  REFUNDED: "destructive",
};

/** Status flow order for the stepper */
export const STATUS_FLOW: ServiceOrderStatus[] = [
  "OPEN",
  "IN_DIAGNOSIS",
  "APPROVED",
  "WAITING_PARTS",
  "IN_PROGRESS",
  "COMPLETED",
  "PAID",
  "READY_FOR_PICKUP",
  "DELIVERED",
];

export const OPTIONAL_STATUSES: ServiceOrderStatus[] = ["WAITING_PARTS"];
export const SPECIAL_STATUSES: ServiceOrderStatus[] = ["CANCELLED", "REFUNDED", "IN_WARRANTY"];

/**
 * Calcula os proximos status mostrados no stepper (paridade com Laravel).
 * Mostra apenas o proximo do fluxo principal. Se o proximo for opcional
 * (WAITING_PARTS), mostra tambem o seguinte para permitir pular o opcional.
 *
 * Retorna [] se OS esta em estado terminal/especial.
 */
export function getNextStatusOptions(current: ServiceOrderStatus): ServiceOrderStatus[] {
  if (SPECIAL_STATUSES.includes(current)) return [];
  const idx = STATUS_FLOW.indexOf(current);
  if (idx === -1 || idx >= STATUS_FLOW.length - 1) return [];
  const next: ServiceOrderStatus[] = [STATUS_FLOW[idx + 1]!];
  // Se o proximo e opcional, exibe tambem o seguinte como alternativa.
  if (OPTIONAL_STATUSES.includes(next[0]!) && idx + 2 < STATUS_FLOW.length) {
    next.push(STATUS_FLOW[idx + 2]!);
  }
  return next;
}

/**
 * Allowed status transitions. Key=current, value=allowed next statuses.
 *
 * Fase de servico (OPEN..IN_PROGRESS): permite SALTO PARA FRENTE livre ate
 * COMPLETED (paridade Laravel, que nao tem maquina de estados — aceita
 * quase qualquer transicao, bloqueando so via guard de assinatura/lab/
 * orcamento no servidor). O front exibe alerta de confirmacao ao pular
 * etapas. WAITING_APPROVAL e a unica que so libera APPROVED (precisa
 * decisao do cliente sobre o orcamento) alem de avancos para frente.
 *
 * Fase pos-conclusao (COMPLETED..DELIVERED): mantida estrita — pagamento
 * e entrega exigem ordem + assinaturas (gates no servidor).
 */
export const ALLOWED_TRANSITIONS: Record<string, ServiceOrderStatus[]> = {
  OPEN: ["IN_DIAGNOSIS", "WAITING_APPROVAL", "APPROVED", "WAITING_PARTS", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_DIAGNOSIS: ["WAITING_APPROVAL", "APPROVED", "WAITING_PARTS", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
  WAITING_APPROVAL: ["APPROVED", "WAITING_PARTS", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
  APPROVED: ["WAITING_PARTS", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
  WAITING_PARTS: ["IN_PROGRESS", "APPROVED", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "WAITING_PARTS", "CANCELLED"],
  COMPLETED: ["PAID", "CANCELLED"],
  PAID: ["READY_FOR_PICKUP", "DELIVERED"],
  READY_FOR_PICKUP: ["DELIVERED"],
  DELIVERED: [], // final state (admin can refund)
  IN_WARRANTY: ["IN_DIAGNOSIS"],
  CANCELLED: [], // admin can uncancell
  REFUNDED: [], // final state
};

/**
 * True se a transicao "pula" etapas do fluxo principal (ex.: OPEN→COMPLETED).
 * Usado pelo front para exibir alerta de confirmacao antes de avancar.
 */
export function isSkippingSteps(
  current: ServiceOrderStatus,
  next: ServiceOrderStatus,
): boolean {
  const ci = STATUS_FLOW.indexOf(current);
  const ni = STATUS_FLOW.indexOf(next);
  if (ci === -1 || ni === -1) return false;
  return ni - ci > 1;
}

export const serviceOrderItemTypeEnum = z.enum(["SERVICE", "PRODUCT"]);
export type ServiceOrderItemType = z.infer<typeof serviceOrderItemTypeEnum>;

export const deviceTypeEnum = z.enum([
  "iPhone",
  "iPad",
  "MacBook",
  "Android",
  "Notebook",
  "Console",
  "Outro",
]);
export type DeviceType = z.infer<typeof deviceTypeEnum>;

/**
 * Tipo de garantia da OS. Paridade 1:1 com Laravel `tipo_garantia`:
 *   retorno_servico → "return"
 *   produto_vendido → "sold_product"
 *   fabricante      → "manufacturer"
 *
 * `none` continua disponivel para OS sem garantia (= `isWarranty=false`).
 */
export const warrantyTypeEnum = z.enum([
  "none",
  "return",        // Retorno de servico (a propria loja fez o servico anteriormente)
  "sold_product",  // Produto vendido na loja
  "manufacturer",  // Garantia de fabrica
]);
export type WarrantyType = z.infer<typeof warrantyTypeEnum>;

export const WARRANTY_TYPE_LABELS: Record<string, string> = {
  none: "Sem Garantia",
  return: "Retorno de Servico",
  sold_product: "Produto Vendido na Loja",
  manufacturer: "Garantia de Fabricante",
};

// ── Checklist ──

/**
 * Checklist item: true=OK, false=NOK, null=N/A
 *
 * Os 15 itens espelham 1:1 as colunas `check_entrada_*` / `check_saida_*` do
 * Laravel — preserva fidelidade total na migracao de dados (ADR 0043).
 */
export const checklistSchema = z.object({
  aparelhoLiga: z.boolean().nullable().optional(),         // check_entrada_aparelho_liga
  aparelhoVibra: z.boolean().nullable().optional(),        // check_entrada_aparelho_vibra
  botoes: z.boolean().nullable().optional(),               // check_entrada_botoes_ok
  bluetooth: z.boolean().nullable().optional(),            // check_entrada_bluetooth_ok
  wifi: z.boolean().nullable().optional(),                 // check_entrada_wifi_ok
  vidroTraseiro: z.boolean().nullable().optional(),        // check_entrada_vidro_traseiro_ok
  audio: z.boolean().nullable().optional(),                // check_entrada_audio_ok
  microfone: z.boolean().nullable().optional(),            // check_entrada_microfone_ok
  camerasFlash: z.boolean().nullable().optional(),         // check_entrada_cameras_flash_ok
  touchFaceId: z.boolean().nullable().optional(),          // check_entrada_touch_faceid_ok
  aparelhoCarrega: z.boolean().nullable().optional(),      // check_entrada_aparelho_carrega
  telaFrontal: z.boolean().nullable().optional(),          // check_entrada_tela_frontal_ok
  carregamentoCabo: z.boolean().nullable().optional(),     // check_entrada_carregamento_cabo
  carregamentoInducao: z.boolean().nullable().optional(),  // check_entrada_carregamento_inducao
  imaMagsafe: z.boolean().nullable().optional(),           // check_entrada_ima_magsafe
});

export type ChecklistData = z.infer<typeof checklistSchema>;

export const CHECKLIST_ITEMS: { key: keyof ChecklistData; label: string }[] = [
  { key: "aparelhoLiga", label: "Aparelho liga" },
  { key: "aparelhoVibra", label: "Aparelho vibra" },
  { key: "botoes", label: "Botoes" },
  { key: "bluetooth", label: "Bluetooth" },
  { key: "wifi", label: "Wi-Fi" },
  { key: "vidroTraseiro", label: "Vidro traseiro" },
  { key: "audio", label: "Audio" },
  { key: "microfone", label: "Microfone" },
  { key: "camerasFlash", label: "Cameras e flash" },
  { key: "touchFaceId", label: "Touch / Face ID" },
  { key: "aparelhoCarrega", label: "Aparelho carrega" },
  { key: "telaFrontal", label: "Tela frontal" },
  { key: "carregamentoCabo", label: "Carregamento por cabo" },
  { key: "carregamentoInducao", label: "Carregamento por inducao" },
  { key: "imaMagsafe", label: "Ima / MagSafe" },
];

// ── Device Info (additional info checkboxes) ──

export const deviceInfoSchema = z.object({
  deviceGotWet: z.boolean().optional(),           // Aparelho molhou
  notOriginalCharger: z.boolean().optional(),     // Nao usa fonte original
  deviceFell: z.boolean().optional(),             // Aparelho sofreu queda
  hiddenProblems: z.boolean().optional(),          // Problemas ocultos
  otherRepairShop: z.boolean().optional(),         // Outra assistencia recente
  accessoriesReturned: z.boolean().optional(),     // Acessorios/chip devolvidos
});

export type DeviceInfoData = z.infer<typeof deviceInfoSchema>;

export const DEVICE_INFO_ITEMS: { key: keyof DeviceInfoData; label: string }[] = [
  { key: "deviceGotWet", label: "Aparelho molhou" },
  { key: "notOriginalCharger", label: "Nao usa fonte original" },
  { key: "deviceFell", label: "Aparelho sofreu queda" },
  { key: "hiddenProblems", label: "Problemas ocultos" },
  { key: "otherRepairShop", label: "Outra assistencia recente" },
  { key: "accessoriesReturned", label: "Acessorios/chip devolvidos" },
];

// ── Input Schemas ──

/** Item in the wizard */
export const createItemSchema = z.object({
  type: serviceOrderItemTypeEnum,
  serviceId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  description: z.string().min(1, "Descricao obrigatoria"),
  quantity: z.number().int().min(1, "Quantidade minima 1"),
  unitPrice: z.number().int().min(0, "Preco deve ser positivo"), // centavos
  costPrice: z.number().int().min(0).optional(), // centavos
});

/** Create service order (wizard) */
export const createServiceOrderSchema = z.object({
  // Step 1: Customer
  customerId: z.string().uuid("Selecione um cliente"),

  // Step 2: Equipment
  deviceType: z.string().max(100).optional().nullable(),
  deviceBrand: z.string().max(100).optional().nullable(),
  deviceModel: z.string().max(100).optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
  imei: z.string().max(50).optional().nullable(),
  devicePassword: z.string().max(50).optional().nullable(),
  accessories: z.string().max(2000).optional().nullable(),

  // Step 3: Problem + Checklist
  reportedProblem: z.string().min(1, "Problema relatado obrigatorio"),
  entryChecklist: checklistSchema.optional(),
  deviceInfo: deviceInfoSchema.optional(),

  // Step 4: Items
  items: z.array(createItemSchema).min(0),

  // Step 5: Summary
  technicianId: z.string().uuid().optional().nullable(),
  vendorId: z.string().uuid().optional().nullable(),
  serviceProviderId: z.string().uuid().optional().nullable(),
  isWarranty: z.boolean().optional(),
  warrantyType: z.string().optional().nullable(),
  warrantyMonths: z.number().int().min(0).max(120).optional(),
  originalOrderId: z.string().uuid().optional().nullable(),
  customerNotes: z.string().max(2000).optional().nullable(),
  estimatedDate: z.string().optional().nullable(), // ISO date string
}).superRefine((data, ctx) => {
  // Garantia retorno_servico: precisa OS original pra herdar prazo
  // (paridade Laravel logica `tipo_garantia=retorno_servico` em
  // OrdemServicoController:178).
  if (data.warrantyType === "return" && !data.originalOrderId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["originalOrderId"],
      message: "OS original obrigatoria para garantia de retorno de servico",
    });
  }
});

export type CreateServiceOrderInput = z.infer<typeof createServiceOrderSchema>;

/** Update service order (edit page) */
export const updateServiceOrderSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  deviceType: z.string().max(100).optional().nullable(),
  deviceBrand: z.string().max(100).optional().nullable(),
  deviceModel: z.string().max(100).optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
  imei: z.string().max(50).optional().nullable(),
  devicePassword: z.string().max(50).optional().nullable(),
  accessories: z.string().max(2000).optional().nullable(),
  reportedProblem: z.string().min(1).optional(),
  diagnosedProblem: z.string().max(2000).optional().nullable(),
  internalNotes: z.string().max(5000).optional().nullable(),
  customerNotes: z.string().max(2000).optional().nullable(),
  entryChecklist: checklistSchema.optional(),
  exitChecklist: checklistSchema.optional(),
  deviceInfo: deviceInfoSchema.optional(),
  technicianId: z.string().uuid().optional().nullable(),
  vendorId: z.string().uuid().optional().nullable(),
  serviceProviderId: z.string().uuid().optional().nullable(),
  isWarranty: z.boolean().optional(),
  warrantyType: z.string().optional().nullable(),
  warrantyMonths: z.number().int().min(0).max(120).optional(),
  estimatedDate: z.string().optional().nullable(),
  nfseIssued: z.boolean().optional(),
  nfseNumber: z.string().max(40).optional().nullable(),
});

export type UpdateServiceOrderInput = z.infer<typeof updateServiceOrderSchema>;

/** Update status */
export const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: serviceOrderStatusEnum,
  notes: z.string().max(1000).optional().nullable(),
  warrantyMonths: z.number().int().min(0).max(120).optional(),
  // Payment fields (for PAID status)
  paymentMethod: z.string().max(50).optional().nullable(),
  paymentNotes: z.string().max(500).optional().nullable(),
  paymentDiscount: z.number().int().min(0).optional(), // centavos
  notifyWhatsapp: z.boolean().optional(),
  notifyPhone: z.string().max(30).optional().nullable(),
  // Admin bypass: forca PAID fora do PDV / forca DELIVERED sem termo assinado
  force: z.boolean().optional(),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

/** Add item to existing OS */
export const addItemSchema = z.object({
  orderId: z.string().uuid(),
  type: serviceOrderItemTypeEnum,
  serviceId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  description: z.string().min(1, "Descricao obrigatoria"),
  quantity: z.number().int().min(1),
  unitPrice: z.number().int().min(0), // centavos
  costPrice: z.number().int().min(0).optional(), // centavos
});

export type AddItemInput = z.infer<typeof addItemSchema>;

/** Update item */
export const updateItemSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(1).optional(),
  quantity: z.number().int().min(1).optional(),
  unitPrice: z.number().int().min(0).optional(), // centavos
  costPrice: z.number().int().min(0).optional(), // centavos
});

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

/** Register payment */
export const registerPaymentSchema = z.object({
  id: z.string().uuid(),
  paymentMethod: z.string().min(1, "Forma de pagamento obrigatoria"),
  paidAmount: z.number().int().min(0), // centavos
  paymentDiscount: z.number().int().min(0).optional(), // centavos
  paymentNotes: z.string().max(500).optional().nullable(),
  // C7: aplicacao de recompensa (RewardAction APPROVED) como desconto
  rewardActionId: z.string().uuid().optional().nullable(),
  // C3: admin pode bypassar exigencia de caixa aberto (raro, p/ correcao legada)
  force: z.boolean().optional(),
});

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

/** Cancel OS */
export const cancelOrderSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(1, "Motivo do cancelamento obrigatorio").max(500),
  force: z.boolean().optional(),
});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

/** Uncancell OS (admin only) */
export const uncancelOrderSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(1, "Motivo do descancelamento obrigatorio").max(500),
});

/** Refund OS (admin only) */
export const refundOrderSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(10, "Motivo deve ter pelo menos 10 caracteres").max(1000),
});

/** Update costs inline */
export const updateCostsSchema = z.object({
  id: z.string().uuid(),
  partsCost: z.number().int().min(0), // centavos
  otherCost: z.number().int().min(0), // centavos
});

/** List service orders */
export const listServiceOrdersSchema = z.object({
  search: z.string().optional(),
  status: serviceOrderStatusEnum.optional(),
  technicianId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["number", "entryDate", "totalAmount", "status", "customerName"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export type ListServiceOrdersInput = z.infer<typeof listServiceOrdersSchema>;

/** Create quote (orcamento adicional) */
export const createQuoteSchema = z.object({
  orderId: z.string().uuid(),
  newServiceAmount: z.number().int().min(0), // centavos
  newPartsAmount: z.number().int().min(0).optional(), // centavos
  newDiscount: z.number().int().min(0).optional(), // centavos
  reason: z.string().min(1, "Motivo obrigatorio").max(1000),
  additionalServices: z.string().max(1000).optional().nullable(),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

/** Approve/reject quote (public page) */
export const respondQuoteSchema = z.object({
  link: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  customerNotes: z.string().max(500).optional().nullable(),
});

export type RespondQuoteInput = z.infer<typeof respondQuoteSchema>;

/** Admin responde orcamento sem link publico — gestor aprova direto. */
export const adminRespondQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  notes: z.string().max(500).optional().nullable(),
});
export type AdminRespondQuoteInput = z.infer<typeof adminRespondQuoteSchema>;

/** Anexa PDF/imagem da NFS-e emitida manualmente (upload direto base64). */
export const attachNfseSchema = z.object({
  orderId: z.string().uuid(),
  nfseNumber: z.string().max(40).optional().nullable(),
  fileBase64: z.string().min(1).max(8 * 1024 * 1024), // ~6MB de arquivo (base64 inflado)
  fileName: z.string().max(255),
  contentType: z.string().regex(/^(application\/pdf|image\/(png|jpe?g|webp))$/),
});
export type AttachNfseInput = z.infer<typeof attachNfseSchema>;

/** Salva assinatura SVG/PNG base64 capturada via signature-pad. */
export const saveSignaturePadSchema = z.object({
  orderId: z.string().uuid(),
  // entry = entrada do aparelho na loja; exit = retirada/entrega ao cliente.
  moment: z.enum(["entry", "exit"]),
  // signer = quem assinou (cliente ou tecnico).
  signer: z.enum(["client", "technician"]),
  // Data URL: "data:image/svg+xml;base64,..." ou "data:image/png;base64,...".
  // Aceita ate ~512KB de payload (assinatura SVG e leve, ~5-20KB).
  dataUrl: z.string().min(1).max(700_000).regex(/^data:image\/(svg\+xml|png|jpe?g);base64,/),
});
export type SaveSignaturePadInput = z.infer<typeof saveSignaturePadSchema>;

/** Send signature (Autentique) */
export const sendSignatureSchema = z.object({
  orderId: z.string().uuid(),
  phone: z.string().min(8, "Numero de telefone invalido").max(30),
  type: z.enum(["entry", "delivery", "return"]),
});

/** Confirm physical signature */
export const confirmPhysicalSignatureSchema = z.object({
  orderId: z.string().uuid(),
  type: z.enum(["entry", "delivery", "return"]),
  reason: z.string().max(500).optional().nullable(),
});

/** Lab external */
export const sendToLabSchema = z.object({
  orderId: z.string().uuid(),
  deliveryPersonId: z.string().uuid().optional().nullable(),
  /** Mensagem WhatsApp opcional para o entregador (paridade Laravel `entregador_solicitacao`). */
  message: z.string().max(1000).optional().nullable(),
});

export const receiveFromLabSchema = z.object({
  orderId: z.string().uuid(),
});

export const cancelLabSchema = z.object({
  orderId: z.string().uuid(),
});

/** Search parts/products from stock */
export const searchPartsSchema = z.object({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

/** Send tracking link via WhatsApp */
export const sendTrackingSchema = z.object({
  orderId: z.string().uuid(),
  phone: z.string().min(8).max(30),
});

/** Notify delivery person via WhatsApp */
export const notifyDeliveryPersonSchema = z.object({
  orderId: z.string().uuid(),
  deliveryPersonId: z.string().uuid(),
  message: z.string().min(1).max(1000),
  context: z.string().max(50).optional().nullable(),
});

/** Send delivery term (Autentique + WhatsApp) */
export const sendDeliveryTermSchema = z.object({
  orderId: z.string().uuid(),
  phone: z.string().min(8).max(30).optional().nullable(),
});

/** Confirm physical delivery term */
export const confirmPhysicalDeliveryTermSchema = z.object({
  orderId: z.string().uuid(),
});

/** Check delivery term status (Autentique) */
export const checkDeliveryTermStatusSchema = z.object({
  orderId: z.string().uuid(),
});

/** Send return term (Autentique + WhatsApp) */
export const sendReturnTermSchema = z.object({
  orderId: z.string().uuid(),
  phone: z.string().min(8).max(30).optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
});

/** Confirm physical return term */
export const confirmPhysicalReturnTermSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().max(500).optional().nullable(),
});

/** Check return term status (Autentique) */
export const checkReturnTermStatusSchema = z.object({
  orderId: z.string().uuid(),
});

/** Send quote via WhatsApp */
export const sendQuoteWhatsAppSchema = z.object({
  orderId: z.string().uuid(),
  phone: z.string().min(8).max(30).optional().nullable(),
});

/** Check quote status (polling) */
export const checkQuoteStatusSchema = z.object({
  orderId: z.string().uuid(),
});

/** Update technical info (diagnosis/notes) */
export const updateTechnicalInfoSchema = z.object({
  orderId: z.string().uuid(),
  diagnosedProblem: z.string().max(2000).optional().nullable(),
  internalNotes: z.string().max(5000).optional().nullable(),
});

/** Update technician (admin) */
export const updateTechnicianSchema = z.object({
  orderId: z.string().uuid(),
  technicianId: z.string().uuid(),
});

/** Get OS by customer (for warranty check) */
export const getByCustomerSchema = z.object({
  customerId: z.string().uuid(),
});

/** Send receipt via WhatsApp */
export const sendReceiptSchema = z.object({
  orderId: z.string().uuid(),
  phone: z.string().min(8).max(30).optional().nullable(),
});
