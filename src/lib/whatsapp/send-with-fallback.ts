/**
 * Servico de envio WhatsApp com fallback inteligente.
 *
 * Paridade com Laravel MetaWhatsAppService::enviarPdfComFallbackTemplate +
 * MetaTemplateService::sendTemplatePorContexto.
 *
 * Fluxo:
 *  1) Dentro da janela 24h → envia texto livre ou mídia (PDF) sem template
 *  2) Fora da janela → template aprovado, com cadeia de fallback:
 *     `*_pdf_link` (PENDING) → `*_pdf` (mesma familia) → `os_orcamento_pdf`
 *     (PDF generico) → `padrao` (so notificacao)
 */
import {
  sendCloudText,
  sendCloudTemplate,
  formatBrPhone,
} from "@/lib/services/whatsapp-cloud-service";
import {
  APPROVED_TEMPLATES,
  TEMPLATE_CONTEXTS,
  CONTEXT_SUBJECT,
  type WhatsAppTemplate,
} from "@/lib/whatsapp/templates-catalog";
import { isWithin24hWindow } from "@/lib/whatsapp/conversation-window";
import { tenantHasTemplate } from "@/lib/services/whatsapp-template-sync";
import { logger } from "@/lib/logger";
import { withTenant } from "@/server/db";

export type WhatsAppContext = keyof typeof TEMPLATE_CONTEXTS;

/**
 * Contexto de auditoria do envio. Quando passado, o resultado e gravado em
 * `whatsapp_messages_sent` (rastreabilidade de mensagens). A tabela tem RLS por
 * tenant, por isso o `tenantId` e obrigatorio para logar. `originType`/`originId`
 * ligam o envio a entidade que o originou (ex: "sale"/saleId, "service_order"/osId).
 */
export interface WhatsAppLogContext {
  tenantId: string;
  originType?: string;
  originId?: string;
}

/**
 * Persiste o registro do envio em whatsapp_messages_sent. Resiliente: nunca
 * lanca — uma falha de log JAMAIS deve impedir/derrubar o envio em si.
 */
async function logWhatsappSent(
  log: WhatsAppLogContext,
  phone: string,
  result: SendResult,
  fallback: { templateName?: string; content?: string },
): Promise<void> {
  try {
    const type = result.via === "template" ? "template" : result.via === "media" ? "media" : "text";
    const status = result.success ? "enviado" : "falha";
    await withTenant(log.tenantId, (tx) =>
      tx.whatsappMessageSent.create({
        data: {
          tenantId: log.tenantId,
          phone: formatBrPhone(phone),
          type,
          templateName: result.templateUsed ?? fallback.templateName ?? null,
          content: fallback.content ?? null,
          wamid: result.messageId ?? null,
          status,
          errorMessage: result.error ?? null,
          originType: log.originType ?? null,
          originId: log.originId ?? null,
        },
      }),
    );
  } catch (err) {
    // Nao propaga: o envio ja aconteceu; so registramos a falha de auditoria.
    logger.warn("Falha ao registrar envio WhatsApp em whatsapp_messages_sent", {
      err: err instanceof Error ? err.message : String(err),
      phone: formatBrPhone(phone),
      originType: log.originType,
      originId: log.originId,
    });
  }
}

export interface MediaHeader {
  type: "document" | "image" | "video";
  link: string;
  filename?: string;
}

export interface SendResult {
  success: boolean;
  via: "text" | "media" | "template" | "mock";
  templateUsed?: string;
  messageId?: string;
  error?: string;
}

/** Resultado mínimo de um envio — o que a cadeia de fallback precisa saber. */
type WhatsAppSendOutcome = { success: boolean; messageId?: string; error?: string };

/**
 * Templates aprovados na WABA deste tenant, ou `null` quando não sabemos
 * (tenant sem credencial própria, ou credencial nunca sincronizada).
 *
 * Nunca lança: falha de leitura devolve `null`, que o `tenantHasTemplate`
 * interpreta como "pode tentar" — o comportamento anterior.
 */
async function approvedTemplatesFor(tenantId: string): Promise<string[] | null> {
  try {
    const [{ withAdmin }, { readCloudCredential }] = await Promise.all([
      import("@/server/db"),
      import("@/lib/services/whatsapp-tenant-config"),
    ]);
    const row = await withAdmin((tx) =>
      tx.tenantIntegration.findUnique({
        where: { tenantId_provider: { tenantId, provider: "WHATSAPP_CLOUD" } },
        select: { enabled: true, config: true },
      }),
    );
    // Integração desligada = envio sai pela conta da Arena Tech, cujos templates
    // são os do catálogo. A lista do tenant não se aplica.
    if (!row?.enabled) return null;
    return readCloudCredential(row.config)?.approvedTemplates ?? null;
  } catch (error) {
    logger.warn("WhatsApp: falha ao ler templates aprovados do tenant", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Monta o array `components` esperado pela Meta Cloud API. */
function buildComponents(
  template: WhatsAppTemplate,
  params: string[],
  header?: MediaHeader,
  urlButtonParam?: string,
): unknown[] {
  const components: unknown[] = [];

  // HEADER de midia (document/image/video)
  if (template.hasDocumentHeader && header) {
    const mediaPayload: Record<string, string> = { link: header.link };
    if (header.type === "document" && header.filename) {
      mediaPayload.filename = header.filename;
    }
    components.push({
      type: "header",
      parameters: [
        {
          type: header.type,
          [header.type]: mediaPayload,
        },
      ],
    });
  }

  // BODY: substitui {{1}}, {{2}}...
  if (template.params > 0) {
    components.push({
      type: "body",
      parameters: params.map((v) => ({ type: "text", text: String(v) })),
    });
  }

  // Botao OTP COPY_CODE
  if (template.isOtp && params[0]) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: String(params[0]) }],
    });
  }

  // Botao URL dinamico (ex: token Autentique)
  if (template.hasUrlButton && urlButtonParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: String(urlButtonParam) }],
    });
  }

  return components;
}

/** Tenta variante PDF da mesma familia (`*_pdf_link` → `*_pdf`). */
function variantPdfOfLink(key: string): string | null {
  if (!key.endsWith("_pdf_link")) return null;
  const variant = key.slice(0, -"_link".length);
  return variant in APPROVED_TEMPLATES ? variant : null;
}

/** Generico PDF aprovado que serve de fallback global. */
function genericPdfFallback(originalKey: string): string | null {
  // simulacao_pdf / servico_orcamento_pdf nao devem cair no generico de OS
  // (texto/assunto errado p/ cliente).
  if (
    ["os_orcamento_pdf", "os_recibo_pdf", "simulacao_pdf", "servico_orcamento_pdf"].includes(originalKey)
  )
    return null;
  return "os_orcamento_pdf";
}

/** Adapta params para o template de fallback (que pode ter assinatura diferente). */
function paramsForFallback(
  fallbackKey: string,
  params: string[],
  contexto: string,
): string[] {
  const t = APPROVED_TEMPLATES[fallbackKey];
  if (!t) return params;
  if (t.params === 2) {
    const nome = params[0] ?? "Cliente";
    const id = params[1] ?? CONTEXT_SUBJECT[contexto] ?? "seu atendimento";
    return [nome, id];
  }
  return params.slice(0, t.params);
}

/**
 * Envia template via contexto, com cadeia de fallback.
 * Espelha Laravel MetaTemplateService::sendTemplatePorContexto.
 */
async function sendTemplateByContext(
  phone: string,
  contexto: WhatsAppContext,
  params: string[],
  header?: MediaHeader,
  urlButtonParam?: string,
  /** Tenant com credencial própria (BYO). Ausente = credencial do ambiente. */
  tenantId?: string,
): Promise<SendResult> {
  const templateKey = TEMPLATE_CONTEXTS[contexto];
  if (!templateKey) {
    return { success: false, via: "template", error: `Contexto '${contexto}' sem template mapeado` };
  }
  const template = APPROVED_TEMPLATES[templateKey];
  if (!template) {
    return { success: false, via: "template", error: `Template '${templateKey}' nao cadastrado` };
  }

  // Tenant com WABA própria só tem os templates que ELE aprovou.
  // `APPROVED_TEMPLATES` descreve a conta da Arena Tech — tentar um template que
  // este tenant não tem gastaria uma chamada para receber recusa garantida, e a
  // cadeia de fallback abaixo já cobre o caso.
  //
  // Lista ausente (`null`, nunca sincronizada) NÃO bloqueia: significa "não
  // sabemos", e barrar por falta de informação desligaria quem acabou de
  // conectar. Ver `tenantHasTemplate`.
  const approvedNames = tenantId ? await approvedTemplatesFor(tenantId) : null;
  const podeUsarPrimario = tenantHasTemplate(approvedNames, template.name);

  // Tentativa primaria (pulada quando se sabe que o tenant não tem o template).
  const primary: WhatsAppSendOutcome = podeUsarPrimario
    ? await sendCloudTemplate(
        phone,
        template.name,
        template.language,
        buildComponents(template, params, header, urlButtonParam),
        tenantId,
      )
    : { success: false, error: `Template '${template.name}' não aprovado nesta conta` };

  if (!podeUsarPrimario) {
    logger.info("WhatsApp: template não aprovado nesta WABA — indo direto ao fallback", {
      tenantId,
      template: template.name,
    });
  }
  if (primary.success) {
    return { success: true, via: "template", templateUsed: template.name, messageId: primary.messageId };
  }

  const hasMedia = !!(header && header.type && header.link);

  // Fallback 1: variante PDF (sem botao URL) da mesma familia
  if (hasMedia) {
    const variant = variantPdfOfLink(templateKey);
    if (variant) {
      const t2 = APPROVED_TEMPLATES[variant]!;
      logger.info("WhatsApp template fallback: PDF_link → PDF", { failed: template.name, variant: t2.name });
      const r = await sendCloudTemplate(
        phone, t2.name, t2.language,
        buildComponents(t2, params, header), // sem url button
        tenantId,
      );
      if (r.success) return { success: true, via: "template", templateUsed: t2.name, messageId: r.messageId };
    }

    // Fallback 2: PDF generico
    const generic = genericPdfFallback(templateKey);
    if (generic && generic !== templateKey) {
      const t3 = APPROVED_TEMPLATES[generic]!;
      logger.info("WhatsApp template fallback: PDF → PDF generico", { failed: template.name, generic: t3.name });
      const r = await sendCloudTemplate(
        phone, t3.name, t3.language,
        buildComponents(t3, paramsForFallback(generic, params, contexto), header),
        tenantId,
      );
      if (r.success) return { success: true, via: "template", templateUsed: t3.name, messageId: r.messageId };
    }
  }

  // Fallback 3: padrao (sem PDF — cliente recebe so a notificacao)
  if (templateKey !== "padrao") {
    const padrao = APPROVED_TEMPLATES["padrao"]!;
    const paramsPadrao =
      params.length >= 2
        ? [params[0]!, params[1]!]
        : [params[0] ?? "Cliente", CONTEXT_SUBJECT[contexto] ?? "seu atendimento"];
    logger.info("WhatsApp template fallback: → padrao", { failed: template.name });
    const r = await sendCloudTemplate(
      phone,
      padrao.name,
      padrao.language,
      buildComponents(padrao, paramsPadrao),
      tenantId,
    );
    if (r.success) return { success: true, via: "template", templateUsed: padrao.name, messageId: r.messageId };
    return { success: false, via: "template", error: r.error };
  }

  return { success: false, via: "template", error: primary.error };
}

/**
 * Envia texto livre dentro da janela, fallback para template fora.
 * Paridade Laravel MetaWhatsAppService::enviarComFallbackTemplate.
 */
export async function sendTextWithFallback(opts: {
  phone: string;
  freeText: string;
  contexto: WhatsAppContext;
  params: string[];
  urlButtonParam?: string;
  /** Quando presente, grava o envio em whatsapp_messages_sent (auditoria). */
  log?: WhatsAppLogContext;
}): Promise<SendResult> {
  const normalized = formatBrPhone(opts.phone);
  const inWindow = await isWithin24hWindow(normalized);

  // Tenant com credencial própria (BYO) envia pela WABA dele. Vem de
  // `opts.log.tenantId`, que os chamadores já passam para auditoria — sem isso
  // seria preciso mexer em todos eles. Ausente = credencial do ambiente.
  const tenantId = opts.log?.tenantId;

  let result: SendResult;
  if (inWindow) {
    const r = await sendCloudText(opts.phone, opts.freeText, tenantId);
    result = r.success
      ? { success: true, via: "text", messageId: r.messageId }
      : { success: false, via: "text", error: r.error };
  } else {
    result = await sendTemplateByContext(
      opts.phone,
      opts.contexto,
      opts.params,
      undefined,
      opts.urlButtonParam,
      tenantId,
    );
  }

  if (opts.log) {
    await logWhatsappSent(opts.log, opts.phone, result, { content: opts.freeText });
  }
  return result;
}

/**
 * Envia PDF com fallback inteligente.
 * Paridade Laravel MetaWhatsAppService::enviarPdfComFallbackTemplate.
 */
export async function sendPdfWithFallback(opts: {
  phone: string;
  pdfUrl: string;
  fileName: string;
  caption: string;
  contexto: WhatsAppContext;
  params: string[];
  /** Sufixo passado como param do botao URL (ex: token Autentique). */
  urlButtonParam?: string;
  /** Quando presente, grava o envio em whatsapp_messages_sent (auditoria). */
  log?: WhatsAppLogContext;
}): Promise<SendResult> {
  const normalized = formatBrPhone(opts.phone);
  const inWindow = await isWithin24hWindow(normalized);

  let result: SendResult;
  // Dentro da janela 24h: envio direto via texto livre + link (Meta nao
  // suporta upload binario aqui; o cliente recebe o link no caption).
  // Em prod com janela aberta, Laravel usa sendMedia — mantemos paridade
  // funcional enviando texto com o link de download/assinatura no body.
  if (inWindow) {
    const captionWithLink = opts.caption + (opts.pdfUrl ? `\n\n📎 ${opts.pdfUrl}` : "");
    const r = await sendCloudText(opts.phone, captionWithLink);
    result = r.success
      ? { success: true, via: "text", messageId: r.messageId }
      : { success: false, via: "text", error: r.error };
  } else {
    // Fora da janela: template com HEADER DOCUMENT (PDF anexado).
    result = await sendTemplateByContext(
      opts.phone,
      opts.contexto,
      opts.params,
      { type: "document", link: opts.pdfUrl, filename: opts.fileName },
      opts.urlButtonParam,
    );
  }

  if (opts.log) {
    await logWhatsappSent(opts.log, opts.phone, result, {
      content: opts.caption,
      templateName: TEMPLATE_CONTEXTS[opts.contexto],
    });
  }
  return result;
}
