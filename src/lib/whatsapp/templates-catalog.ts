/**
 * Catalogo de templates WhatsApp aprovados pela Meta.
 * Port direto de Laravel config/whatsapp_templates.php.
 *
 * IMPORTANTE: cada template DEVE estar APPROVED no Meta Business Manager.
 * Para listar templates atuais:
 *   curl -H "Authorization: Bearer $TOKEN" \
 *     "https://graph.facebook.com/v22.0/$WABA_ID/message_templates?fields=name,language,status,category"
 */

export interface WhatsAppTemplate {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  params: number;
  body: string;
  /** Template com HEADER tipo DOCUMENT — anexa PDF/imagem direto */
  hasDocumentHeader?: boolean;
  /** Template com botao URL dinamico — recebe sufixo do link como param */
  hasUrlButton?: boolean;
  /** Templates OTP exigem componente button COPY_CODE com o codigo */
  isOtp?: boolean;
}

export const APPROVED_TEMPLATES: Record<string, WhatsAppTemplate> = {
  // Generico — fallback final.
  padrao: {
    name: "padrao",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    body:
      "Olá, {{1}}! Aqui é da Arena Tech. 👋 Estou entrando em contato sobre {{2}}. " +
      "Quando puder, basta me responder por aqui que continuo seu atendimento.",
  },

  // ── Ordem de Servico — texto puro (sem PDF) ──
  os_orcamento_pronto: {
    name: "os_orcamento_pronto",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    body: "Olá, {{1}}! Seu orçamento da OS {{2}} está pronto. Responda aqui para receber os detalhes e aprovar.",
  },
  os_concluida: {
    name: "os_concluida",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    body: "Olá, {{1}}! Seu aparelho da OS {{2}} está pronto para retirada. Responda aqui para combinarmos.",
  },
  os_recibo_pronto: {
    name: "os_recibo_pronto",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    body: "Olá, {{1}}! Seu recibo da OS {{2}} está pronto. Responda aqui para que eu envie o comprovante.",
  },

  // ── Ordem de Servico — com PDF anexo (HEADER DOCUMENT) ──
  os_recibo_pdf: {
    name: "os_recibo_pdf",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    hasDocumentHeader: true,
    body: "Olá, {{1}}! Segue em anexo o recibo da sua Ordem de Serviço {{2}}. Qualquer dúvida, é só responder por aqui!",
  },
  os_orcamento_pdf: {
    name: "os_orcamento_pdf",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    hasDocumentHeader: true,
    body: "Olá, {{1}}! Segue em anexo o orçamento da sua Ordem de Serviço {{2}}. Qualquer dúvida, é só responder por aqui!",
  },
  os_termo_pdf: {
    name: "os_termo_pdf",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    hasDocumentHeader: true,
    body: "Olá, {{1}}! Segue em anexo o termo referente à sua Ordem de Serviço {{2}}. Qualquer dúvida, é só responder por aqui!",
  },

  // ── PDF + botao URL dinamico (link Autentique) ──
  // URL fixa no template: https://assina.ae/{{1}} — passamos so o token.
  os_termo_pdf_link: {
    name: "os_termo_pdf_link",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    hasDocumentHeader: true,
    hasUrlButton: true,
    body:
      "Olá, {{1}}! Segue em anexo o termo referente à sua Ordem de Serviço {{2}}. " +
      "Toque no botão abaixo para assinar digitalmente.",
  },

  // ── Rastreamento (so botao URL, sem PDF) ──
  os_rastreamento_link: {
    name: "os_rastreamento_link",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    hasUrlButton: true,
    body: "Olá, {{1}}! Sua Ordem de Serviço {{2}} foi aberta. Acompanhe o status em tempo real pelo link abaixo.",
  },

  // ── PDV — recibo + termos ──
  pdv_recibo_pdf: {
    name: "pdv_recibo_pdf",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    hasDocumentHeader: true,
    body: "Olá, {{1}}! Segue em anexo o recibo da sua compra {{2}}. Qualquer dúvida, é só responder por aqui!",
  },
  pdv_termo_pdf_link: {
    name: "pdv_termo_pdf_link",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    hasDocumentHeader: true,
    hasUrlButton: true,
    body:
      "Olá, {{1}}! Segue em anexo o termo da venda {{2}}. " +
      "Toque no botão abaixo para assinar digitalmente.",
  },
};

/**
 * Mapeamento contexto → templateKey (paridade Laravel `contextos`).
 * Use o contexto na API; o template e resolvido no servico.
 */
export const TEMPLATE_CONTEXTS: Record<string, keyof typeof APPROVED_TEMPLATES> = {
  // OS — notificacoes texto puro
  os_orcamento_enviado: "os_orcamento_pronto",
  os_recibo_pronto: "os_recibo_pronto",
  os_conclusao: "os_concluida",
  // OS — com PDF anexo
  os_recibo_pdf: "os_recibo_pdf",
  os_orcamento_pdf: "os_orcamento_pdf",
  os_termo_pdf: "os_termo_pdf",
  os_termo_pdf_link: "os_termo_pdf_link",
  // PDV
  pdv_recibo_pdf: "pdv_recibo_pdf",
  pdv_termo_pdf_link: "pdv_termo_pdf_link",
  // Rastreamento
  os_rastreamento: "os_rastreamento_link",
};

/**
 * Assunto em PT-BR para usar no template `padrao` quando caimos no fallback final.
 */
export const CONTEXT_SUBJECT: Record<string, string> = {
  os_orcamento_enviado: "seu orçamento de ordem de serviço",
  os_recibo_pronto: "seu recibo da ordem de serviço",
  os_termo_pdf: "o termo da sua ordem de serviço",
  os_termo_pdf_link: "o termo da sua ordem de serviço",
  os_recibo_pdf: "seu recibo da ordem de serviço",
  os_orcamento_pdf: "seu orçamento da ordem de serviço",
  os_conclusao: "a conclusão da sua ordem de serviço",
  os_rastreamento: "o acompanhamento da sua ordem de serviço",
  pdv_recibo_pdf: "o recibo da sua compra",
  pdv_termo_pdf_link: "o termo da sua compra",
};
