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
  // v1: URL do botao no Meta apontava para o dominio/rota do Laravel legado
  //   (intranet.arenatechpi.com.br/rastreamento/{{1}}) → 404. A URL do botao e
  //   imutavel em template aprovado, entao foi criado o v2 com a base correta
  //   (pdvdepix.app/os/{{1}}). Mantido aqui apenas para nao quebrar a leitura de
  //   envios historicos; o contexto `os_rastreamento` aponta para o v2.
  os_rastreamento_link: {
    name: "os_rastreamento_link",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    hasUrlButton: true,
    body: "Olá, {{1}}! Sua Ordem de Serviço {{2}} foi aberta. Acompanhe o status em tempo real pelo link abaixo.",
  },
  os_rastreamento_link_v2: {
    name: "os_rastreamento_link_v2",
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

  // ── Simulador de parcelamento — PDF anexo (HEADER DOCUMENT) ──
  // NOTA: este template tem APENAS 1 parametro no body (so o nome).
  simulacao_pdf: {
    name: "simulacao_pdf",
    language: "pt_BR",
    category: "UTILITY",
    params: 1,
    hasDocumentHeader: true,
    body: "Olá, {{1}}! Segue em anexo a simulação solicitada. Qualquer dúvida, é só responder por aqui!",
  },

  // ── Avaliacao de aparelho — texto puro (sem PDF) ──
  // params: {{1}}=nome, {{2}}="do seu iPhone X" (descricao do aparelho).
  avaliacao_orcamento: {
    name: "avaliacao_orcamento",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    body: "Olá, {{1}}! Temos a avaliação {{2}} pronta. Responda aqui para que eu envie os detalhes.",
  },

  // ── Orcamento avulso de servico — PDF anexo (HEADER DOCUMENT) ──
  // params: {{1}}=nome.
  servico_orcamento_pdf: {
    name: "servico_orcamento_pdf",
    language: "pt_BR",
    category: "UTILITY",
    params: 1,
    hasDocumentHeader: true,
    body: "Olá, {{1}}! Segue em anexo o orçamento solicitado. Qualquer dúvida, é só responder por aqui!",
  },

  // ── Notificacao ao tecnico de nova OS atribuida ──
  // Tecnicos podem estar fora da janela 24h (folga, fora do horario).
  // Template garante entrega. params: {{1}}=nome do tecnico, {{2}}=numero OS.
  // APROVADO na WABA 3564717570348730 (verificado via Graph API).
  tecnico_nova_os: {
    name: "tecnico_nova_os",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    body: "Olá, {{1}}! Nova OS atribuída a você: {{2}}. Acesse o sistema para mais detalhes.",
  },

  // ── Solicitacao ao entregador (envio para lab, retirada de aparelho) ──
  // Entregador raramente fala com a loja todo dia → quase sempre fora da
  // janela 24h. Template fallback garante entrega.
  // params: {{1}}=nome do entregador, {{2}}=assunto/contexto da solicitacao.
  // APROVADO na WABA 3564717570348730 (verificado via Graph API).
  entregador_solicitacao: {
    name: "entregador_solicitacao",
    language: "pt_BR",
    category: "UTILITY",
    params: 2,
    body: "Olá, {{1}}! Temos uma solicitação de coleta/entrega referente a {{2}}. Verifique os detalhes no WhatsApp ou responda aqui.",
  },

  // ── Verificação de telefone no auto-cadastro NO-KYC (ADR 0050) ──
  // Categoria AUTHENTICATION: a Meta GERA o corpo (texto fixo) — não se escreve
  // texto livre. Formato "código de cópia" (botão COPY_CODE), validade 10min.
  // {{1}} = código OTP (vai no body E no botão copy_code). O `body` aqui é só a
  // representação local do texto que a Meta renderiza.
  // PENDENTE de aprovação no Meta Business Manager (WABA 3564717570348730).
  // Criar via Graph API:
  //   POST /{WABA_ID}/message_templates
  //   { name:"nokyc_verificacao", language:"pt_BR", category:"AUTHENTICATION",
  //     components:[
  //       { type:"BODY", add_security_recommendation:true },
  //       { type:"FOOTER", code_expiration_minutes:10 },
  //       { type:"BUTTONS", buttons:[{ type:"OTP", otp_type:"COPY_CODE" }] } ] }
  nokyc_verificacao: {
    name: "nokyc_verificacao",
    language: "pt_BR",
    category: "AUTHENTICATION",
    params: 1,
    isOtp: true,
    body: "{{1}} é seu código de verificação. Por segurança, não compartilhe este código.",
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
  os_rastreamento: "os_rastreamento_link_v2",
  // Simulador
  simulacao_pdf: "simulacao_pdf",
  // Avaliacao
  avaliacao_orcamento: "avaliacao_orcamento",
  // Orcamento avulso de servico
  servico_orcamento_pdf: "servico_orcamento_pdf",
  // Notificacoes internas (tecnico/entregador) — fallback para template
  // quando estiver fora da janela 24h. Body do template e texto livre
  // generico; o caption/contexto e enviado pelo chamador.
  tecnico_nova_os: "tecnico_nova_os",
  entregador_solicitacao: "entregador_solicitacao",
  // Contato de lead (interesse) em lote. O lead quase nunca falou com a loja →
  // sempre fora da janela 24h → cai no template `padrao` ([nome, assunto]).
  lead_contato: "padrao",
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
  simulacao_pdf: "a simulação de parcelamento",
  avaliacao_orcamento: "a avaliação do seu aparelho",
  servico_orcamento_pdf: "o orçamento do serviço",
  tecnico_nova_os: "uma nova ordem de serviço atribuída a você",
  entregador_solicitacao: "uma solicitação de coleta/entrega",
  lead_contato: "seu interesse",
};
