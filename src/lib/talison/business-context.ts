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

// Nada aqui é hardcoded por loja (multi-tenant): tudo vem do banco/settings do tenant.
// Quando o banco não tem o dado, o campo é OMITIDO — nunca preenchido com o de outra
// loja (evita vazamento cross-tenant: telefone/Instagram/endereço de um tenant no bot
// de outro). Instagram, mapa e horário específicos da loja moram nas instruções da loja.
const NEUTRAL_STORE_NAME = "nossa loja";

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

/** Endereço só do banco do tenant; null quando não configurado (não usa fallback de outra loja). */
function formatAddress(
  tenantSettings?: TenantSettingsLike | null,
  assistanceSettings?: TenantAssistanceSettingsLike | null,
): string | null {
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
  return configured || null;
}

function formatBusinessHours(input: BuildTalisonBusinessContextInput): string | null {
  const assistanceHours = present(input.tenantAssistanceSettings?.businessHours);
  if (assistanceHours) return assistanceHours;

  const tenantHours = present(input.tenantSettings?.businessHours);
  if (tenantHours) return tenantHours;

  const start = present(input.chatbotConfig?.businessHoursStart);
  const end = present(input.chatbotConfig?.businessHoursEnd);
  if (start && end) return `Atendimento configurado das ${start} às ${end}.`;

  // Sem horário configurado, não invente um (o de outra loja vazaria); o horário da loja
  // vem das instruções da loja quando o admin informar.
  return null;
}

export function buildTalisonBusinessContext(
  input: BuildTalisonBusinessContextInput = {},
): TalisonBusinessContext {
  const tenantSettings = input.tenantSettings;
  const assistanceSettings = input.tenantAssistanceSettings;
  const storeName =
    present(assistanceSettings?.assistanceName) ?? present(tenantSettings?.tradeName) ?? NEUTRAL_STORE_NAME;
  const phone = present(assistanceSettings?.phone) ?? present(tenantSettings?.phone);
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
    // Só contato derivado do banco do tenant; nada hardcoded (Instagram/mapa moram nas
    // instruções da loja). Cada linha só entra se o dado existir — sem vazar o de outra loja.
    contact: [
      ...(address ? [`Endereço: ${address}`] : []),
      ...(phone ? [`WhatsApp/telefone: ${phone}`] : []),
      ...(email ? [`E-mail: ${email}`] : []),
    ],
    businessHours: formatBusinessHours(input),
    payments: [
      "aceita PIX, dinheiro, débito e crédito",
      ...(pixDiscount ? [`PIX/à vista costuma ter ${pixDiscount}% de desconto quando a tool/configuração confirmar`] : []),
      ...(installments ? [`assistência pode ter até ${installments}x sem juros quando a regra/configuração permitir`] : []),
    ],
    delivery: "Entrega/retirada conforme disponibilidade; confirme a área e as condições de entrega com um atendente.",
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
    context.contact.length > 0 ? `Contato e localização: ${context.contact.join(" | ")}.` : null,
    context.businessHours ? `Horário: ${context.businessHours}` : null,
    `Pagamentos: ${context.payments.join("; ")}.`,
    `Entrega: ${context.delivery}`,
    `Garantia e prazos: ${context.warrantyAndTimelines.join("; ")}.`,
    `Handoff: ${context.handoffGuidance.join("; ")}.`,
  ];

  return sections.filter(Boolean).join("\n");
}
