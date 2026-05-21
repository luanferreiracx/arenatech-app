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
import { logger } from "@/lib/logger";

export type WhatsAppContext = keyof typeof TEMPLATE_CONTEXTS;

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
  if (["os_orcamento_pdf", "os_recibo_pdf"].includes(originalKey)) return null;
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
): Promise<SendResult> {
  const templateKey = TEMPLATE_CONTEXTS[contexto];
  if (!templateKey) {
    return { success: false, via: "template", error: `Contexto '${contexto}' sem template mapeado` };
  }
  const template = APPROVED_TEMPLATES[templateKey];
  if (!template) {
    return { success: false, via: "template", error: `Template '${templateKey}' nao cadastrado` };
  }

  // Tentativa primaria
  const primary = await sendCloudTemplate(
    phone,
    template.name,
    template.language,
    buildComponents(template, params, header, urlButtonParam),
  );
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
    const r = await sendCloudTemplate(phone, padrao.name, padrao.language, buildComponents(padrao, paramsPadrao));
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
}): Promise<SendResult> {
  const normalized = formatBrPhone(opts.phone);
  const inWindow = await isWithin24hWindow(normalized);

  if (inWindow) {
    const r = await sendCloudText(opts.phone, opts.freeText);
    return r.success
      ? { success: true, via: "text", messageId: r.messageId }
      : { success: false, via: "text", error: r.error };
  }
  return sendTemplateByContext(opts.phone, opts.contexto, opts.params, undefined, opts.urlButtonParam);
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
}): Promise<SendResult> {
  const normalized = formatBrPhone(opts.phone);
  const inWindow = await isWithin24hWindow(normalized);

  // Dentro da janela 24h: envio direto via texto livre + link (Meta nao
  // suporta upload binario aqui; o cliente recebe o link no caption).
  // Em prod com janela aberta, Laravel usa sendMedia — mantemos paridade
  // funcional enviando texto com o link de download/assinatura no body.
  if (inWindow) {
    const captionWithLink = opts.caption + (opts.pdfUrl ? `\n\n📎 ${opts.pdfUrl}` : "");
    const r = await sendCloudText(opts.phone, captionWithLink);
    return r.success
      ? { success: true, via: "text", messageId: r.messageId }
      : { success: false, via: "text", error: r.error };
  }

  // Fora da janela: template com HEADER DOCUMENT (PDF anexado).
  return sendTemplateByContext(
    opts.phone,
    opts.contexto,
    opts.params,
    { type: "document", link: opts.pdfUrl, filename: opts.fileName },
    opts.urlButtonParam,
  );
}
