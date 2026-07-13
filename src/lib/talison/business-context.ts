type ChatbotConfigLike = {
  businessHoursStart?: string | null;
  businessHoursEnd?: string | null;
  outOfHoursMessage?: string | null;
  handoffMessage?: string | null;
};

type TenantSettingsLike = {
  tradeName?: string | null;
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  businessHours?: string | null;
  warrantyNewMonths?: number | null;
  warrantyUsedMonths?: number | null;
};

type TenantAssistanceSettingsLike = {
  assistanceName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  warrantyPolicy?: string | null;
  businessHours?: string | null;
  installmentsNoInterest?: number | null;
  pixDiscount?: { toString(): string } | number | string | null;
  valuationValidityDays?: number | null;
};

export type TalisonBusinessContext = {
  storeName: string;
  identity: string;
  contact: string[];
  businessHours: string | null;
  payments: string[];
  delivery: string;
  warrantyAndTimelines: string[];
  handoffGuidance: string[];
};

export type BuildTalisonBusinessContextInput = {
  chatbotConfig?: ChatbotConfigLike | null;
  tenantSettings?: TenantSettingsLike | null;
  tenantAssistanceSettings?: TenantAssistanceSettingsLike | null;
};

const DEFAULT_STORE_NAME = "Arena Tech";
const DEFAULT_PHONE = "(86) 99564-7443";
const DEFAULT_INSTAGRAM = "@arenatechpi";
const DEFAULT_MAPS_URL = "https://maps.app.goo.gl/5dmJeT2y4cCGsKQD8";
const DEFAULT_LOCATION =
  "Riverside Shopping, praça da Caixa Econômica, corredor da Kalor Produções, ao lado da IAP, Teresina/PI";

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function decimalToText(value: TenantAssistanceSettingsLike["pixDiscount"]): string | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "object" ? value.toString() : String(value);
  const normalized = raw.replace(".", ",");
  return normalized.endsWith(",00") ? normalized.slice(0, -3) : normalized;
}

function formatAddress(
  tenantSettings?: TenantSettingsLike | null,
  assistanceSettings?: TenantAssistanceSettingsLike | null,
): string {
  const assistanceAddress = present(assistanceSettings?.address);
  if (assistanceAddress) {
    const cityState = [present(assistanceSettings?.city), present(assistanceSettings?.state)]
      .filter(Boolean)
      .join("/");
    return cityState ? `${assistanceAddress}, ${cityState}` : assistanceAddress;
  }

  const streetLine = [
    present(tenantSettings?.street),
    present(tenantSettings?.streetNumber),
    present(tenantSettings?.complement),
  ]
    .filter(Boolean)
    .join(", ");
  const cityLine = [present(tenantSettings?.neighborhood), present(tenantSettings?.city), present(tenantSettings?.state)]
    .filter(Boolean)
    .join(" - ");
  const configured = [streetLine, cityLine].filter(Boolean).join(" — ");
  return configured || DEFAULT_LOCATION;
}

function formatBusinessHours(input: BuildTalisonBusinessContextInput): string | null {
  const assistanceHours = present(input.tenantAssistanceSettings?.businessHours);
  if (assistanceHours) return assistanceHours;

  const tenantHours = present(input.tenantSettings?.businessHours);
  if (tenantHours) return tenantHours;

  const start = present(input.chatbotConfig?.businessHoursStart);
  const end = present(input.chatbotConfig?.businessHoursEnd);
  if (start && end) return `Atendimento configurado das ${start} às ${end}.`;

  return "Segunda a sábado, das 09h30 às 20h.";
}

export function buildTalisonBusinessContext(
  input: BuildTalisonBusinessContextInput = {},
): TalisonBusinessContext {
  const tenantSettings = input.tenantSettings;
  const assistanceSettings = input.tenantAssistanceSettings;
  const storeName =
    present(assistanceSettings?.assistanceName) ?? present(tenantSettings?.tradeName) ?? DEFAULT_STORE_NAME;
  const phone = present(assistanceSettings?.phone) ?? present(tenantSettings?.phone) ?? DEFAULT_PHONE;
  const email = present(assistanceSettings?.email) ?? present(tenantSettings?.email);
  const address = formatAddress(tenantSettings, assistanceSettings);
  const pixDiscount = decimalToText(assistanceSettings?.pixDiscount);
  const installments = assistanceSettings?.installmentsNoInterest;
  const warrantyPolicy = present(assistanceSettings?.warrantyPolicy);

  return {
    storeName,
    // Identidade/serviços/limitações da loja passaram para o campo editável "instruções
    // da loja" (ADR 0055) — fonte única. Aqui fica só o nome (derivado do banco); o resto
    // do "quem somos / o que fazemos" vem das instruções da loja.
    identity: `Nome da loja: ${storeName}.`,
    contact: [
      `Endereço: ${address}`,
      `WhatsApp/telefone: ${phone}`,
      `Instagram: ${DEFAULT_INSTAGRAM}`,
      `Mapa: ${DEFAULT_MAPS_URL}`,
      ...(email ? [`E-mail: ${email}`] : []),
    ],
    businessHours: formatBusinessHours(input),
    payments: [
      "aceita PIX, dinheiro, débito e crédito",
      ...(pixDiscount ? [`PIX/à vista costuma ter ${pixDiscount}% de desconto quando a tool/configuração confirmar`] : []),
      ...(installments ? [`assistência pode ter até ${installments}x sem juros quando a regra/configuração permitir`] : []),
    ],
    delivery: "Entrega/retirada com atendimento local; entrega restrita a Teresina/PI quando disponível.",
    warrantyAndTimelines: [
      ...(warrantyPolicy ? [`Política de garantia configurada: ${warrantyPolicy}`] : []),
      "prazos e garantias específicos de OS/produto devem ser consultados por tool ou confirmados por atendente",
      "como referência geral, reparos simples podem levar horas e casos de placa/análise podem levar dias, mas nunca prometa prazo específico sem dado confirmado",
    ],
    handoffGuidance: [
      ...(present(input.chatbotConfig?.handoffMessage) ? [`Mensagem padrão de handoff: ${input.chatbotConfig?.handoffMessage}`] : []),
      "em vendas, qualifique o interesse antes de transferir: nome, produto/modelo desejado, orçamento, forma de pagamento, troca e urgência quando fizer sentido",
      "transfira para humano sempre que ficar claro que o cliente quer fechar a venda",
    ],
  };
}

export function renderTalisonBusinessContext(context: TalisonBusinessContext): string {
  const sections = [
    context.identity,
    `Contato e localização: ${context.contact.join(" | ")}.`,
    context.businessHours ? `Horário: ${context.businessHours}` : null,
    `Pagamentos: ${context.payments.join("; ")}.`,
    `Entrega: ${context.delivery}`,
    `Garantia e prazos: ${context.warrantyAndTimelines.join("; ")}.`,
    `Handoff: ${context.handoffGuidance.join("; ")}.`,
  ];

  return sections.filter(Boolean).join("\n");
}
