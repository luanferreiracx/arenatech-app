/**
 * Autentique integration for digital signature of documents.
 *
 * When AUTENTIQUE_API_KEY is configured, makes real GraphQL API requests.
 * Otherwise logs and returns mock success for development.
 *
 * @see https://docs.autentique.com.br/
 */

import { logger } from "@/lib/logger";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface AutentiqueResult {
  success: boolean;
  documentId?: string;
  signatureLink?: string;
  error?: string;
}

export interface AutentiqueDocumentStatus {
  success: boolean;
  signed: boolean;
  signaturesCompleted: number;
  totalSignatures: number;
  error?: string;
}

interface AutentiqueConfig {
  apiKey: string;
  apiUrl: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

function getConfig(): AutentiqueConfig | null {
  const apiKey = process.env.AUTENTIQUE_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Autentique: AUTENTIQUE_API_KEY ausente em prod. Configure a env ou desabilite assinatura digital.",
      );
    }
    return null;
  }
  return {
    apiKey,
    apiUrl: process.env.AUTENTIQUE_API_URL ?? "https://api.autentique.com.br/v2/graphql",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Formata um numero de telefone para o formato esperado pela Autentique.
 * Paridade Laravel AutentiqueService::formatarWhatsApp.
 * - Remove nao-digitos
 * - Adiciona "55" no inicio se faltar
 * - Insere o "9" do celular se telefone tiver 12 digitos (55 + DDD + 8)
 * - Retorna no formato +5586999998888
 */
export function formatWhatsApp(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (!digits.startsWith("55")) {
    digits = "55" + digits;
  }
  if (digits.length === 12) {
    // 55 + DDD(2) + 9 + 8 digitos
    digits = digits.substring(0, 4) + "9" + digits.substring(4);
  }
  return "+" + digits;
}

/**
 * Valida formato de WhatsApp (12 ou 13 digitos com codigo do pais).
 */
export function validateWhatsApp(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 12 && digits.length <= 13;
}

/**
 * Traduz mensagem de erro da Autentique para mensagem amigavel ao usuario.
 */
export function translateAutentiqueError(error: string): string {
  const translations: Record<string, string> = {
    unavaible_credits: "Sem créditos disponíveis na Autentique. Adquira mais créditos para enviar documentos.",
    unavailable_credits: "Sem créditos disponíveis na Autentique. Adquira mais créditos para enviar documentos.",
    insufficient_credits: "Créditos insuficientes na Autentique.",
    invalid_phone: "Número de telefone inválido para envio via WhatsApp.",
    invalid_document: "Documento inválido ou corrompido.",
    document_not_found: "Documento não encontrado na Autentique.",
    unauthorized: "Token de API da Autentique inválido ou expirado.",
    rate_limit_exceeded: "Limite de requisições excedido. Tente novamente em alguns minutos.",
    internal_error: "Erro interno na Autentique. Tente novamente mais tarde.",
    validation: "Erro de validação. Verifique se o número de WhatsApp está correto.",
  };
  const lower = error.toLowerCase();
  for (const [key, msg] of Object.entries(translations)) {
    if (lower.includes(key)) return msg;
  }
  return error;
}

export function extractShortlinkToken(link: string): string | null {
  if (!link) return null;
  const match = link.match(/\/([^/]+)$/);
  return match?.[1] ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a document in Autentique with a signature link.
 * Sends PDF content as base64 and returns the signature link.
 */
export async function createDocumentWithLink(
  title: string,
  signers: Array<{ name: string; whatsapp: string }>,
  pdfContent: Buffer,
): Promise<AutentiqueResult> {
  const config = getConfig();

  if (!config) {
    logger.info("Autentique: mock mode (no credentials)", { title });
    return {
      success: true,
      documentId: `mock-autentique-${Date.now()}`,
      signatureLink: `https://app.autentique.com.br/mock/${Date.now()}`,
    };
  }

  logger.info("Autentique: creating document", { title, signersCount: signers.length });

  try {
    // Padrao Laravel AutentiqueService::criarDocumentoComLink:
    // - delivery_method = DELIVERY_METHOD_LINK (gera link; envio pelo nosso WhatsApp depois)
    // - mutation com variables (mais seguro que interpolacao de string)
    // - multipart: 'file' (nao '0'), map { file: ["variables.file"] }
    const signersData = signers.map((s) => ({
      name: s.name || "Cliente",
      phone: formatWhatsApp(s.whatsapp),
      delivery_method: "DELIVERY_METHOD_LINK",
      action: "SIGN",
    }));

    logger.info("Autentique: signers payload", {
      signers: signersData.map((s) => ({ name: s.name, phone: s.phone })),
    });

    const query = `mutation CreateDocument($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!, $sandbox: Boolean) {
      createDocument(sandbox: $sandbox, document: $document, signers: $signers, file: $file) {
        id
        name
        signatures {
          public_id
          created_at
          action { name }
          link { short_link }
        }
      }
    }`;

    const sandbox = (process.env.AUTENTIQUE_SANDBOX ?? "false").toLowerCase() === "true";

    const operations = JSON.stringify({
      query,
      variables: {
        sandbox,
        document: { name: title },
        signers: signersData,
        file: null,
      },
    });

    // Sanity check: o conteudo precisa ser um PDF real, senao Autentique rejeita
    // com "must_be_type:pdf,...". Log dos primeiros bytes para diagnostico.
    const head = pdfContent.subarray(0, 8).toString("latin1");
    logger.info("Autentique: file payload", {
      size: pdfContent.length,
      head,
      isPdf: head.startsWith("%PDF-"),
    });

    const formData = new FormData();
    formData.append("operations", operations);
    formData.append("map", JSON.stringify({ file: ["variables.file"] }));
    formData.append(
      "file",
      new Blob([new Uint8Array(pdfContent)], { type: "application/pdf" }),
      "documento.pdf",
    );

    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Autentique: HTTP error", { status: response.status, body: body.substring(0, 500) });
      return {
        success: false,
        error: `Autentique HTTP ${response.status}: ${body.substring(0, 200)}`,
      };
    }

    const json = (await response.json()) as Record<string, unknown>;
    const data = json["data"] as Record<string, unknown> | undefined;
    const errors = json["errors"] as Array<Record<string, unknown>> | undefined;
    const createDocument = data?.["createDocument"] as Record<string, unknown> | undefined;

    if (errors && errors.length > 0) {
      const gqlMsg = String(errors[0]?.["message"] ?? "Erro desconhecido");
      const translated = translateAutentiqueError(gqlMsg);
      // Tenta extrair detalhes adicionais (validation errors do Autentique vem em extensions.validation)
      const extensions = errors[0]?.["extensions"] as Record<string, unknown> | undefined;
      const validation = extensions?.["validation"] as Record<string, string[]> | undefined;
      const validationDetails = validation
        ? Object.entries(validation).map(([k, v]) => `${k}: ${v.join(", ")}`).join("; ")
        : null;
      logger.error("Autentique: GraphQL errors", { errors, validationDetails });
      const finalMsg = validationDetails
        ? `${translated} (${validationDetails})`
        : translated === gqlMsg
          ? translated
          : `${translated} — original: ${gqlMsg}`;
      return { success: false, error: finalMsg };
    }

    if (!createDocument) {
      logger.error("Autentique: payload sem createDocument", { json });
      return {
        success: false,
        error: `Resposta inesperada do Autentique: ${JSON.stringify(json).substring(0, 300)}`,
      };
    }

    const docId = String(createDocument["id"] ?? "");
    const signatures = createDocument["signatures"] as Array<Record<string, unknown>> | undefined;
    let signatureLink: string | undefined;

    for (const sig of signatures ?? []) {
      const link = sig["link"] as Record<string, unknown> | undefined;
      if (link?.["short_link"]) {
        signatureLink = String(link["short_link"]);
        break;
      }
    }

    logger.info("Autentique: document created", { docId, signatureLink });

    return { success: true, documentId: docId, signatureLink };
  } catch (error) {
    logger.error("Autentique: create error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao criar documento",
    };
  }
}

/**
 * Check the signature status of a document.
 */
export async function getDocumentStatus(
  documentId: string,
): Promise<AutentiqueDocumentStatus> {
  const config = getConfig();

  if (!config) {
    logger.info("Autentique: mock status check", { documentId });
    return { success: true, signed: false, signaturesCompleted: 0, totalSignatures: 1 };
  }

  logger.info("Autentique: checking status", { documentId });

  try {
    const query = `
      query {
        document(id: "${documentId}") {
          id
          name
          signatures {
            public_id
            name
            action { name }
            signed { created_at }
          }
        }
      }
    `;

    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        signed: false,
        signaturesCompleted: 0,
        totalSignatures: 0,
        error: `Autentique HTTP ${response.status}: ${body.substring(0, 200)}`,
      };
    }

    const json = (await response.json()) as Record<string, unknown>;
    const data = json["data"] as Record<string, unknown> | undefined;
    const document = data?.["document"] as Record<string, unknown> | undefined;

    if (!document) {
      return {
        success: false,
        signed: false,
        signaturesCompleted: 0,
        totalSignatures: 0,
        error: "Documento nao encontrado no Autentique",
      };
    }

    const signatures = document["signatures"] as Array<Record<string, unknown>> | undefined;
    let signaturesCompleted = 0;
    let totalSignatures = 0;

    for (const sig of signatures ?? []) {
      const action = sig["action"] as Record<string, unknown> | undefined;
      if (action?.["name"] === "SIGN") {
        totalSignatures++;
        const signed = sig["signed"] as Record<string, unknown> | null;
        if (signed?.["created_at"]) {
          signaturesCompleted++;
        }
      }
    }

    const allSigned = totalSignatures > 0 && signaturesCompleted >= totalSignatures;

    logger.info("Autentique: status checked", {
      documentId,
      signed: allSigned,
      signaturesCompleted,
      totalSignatures,
    });

    return { success: true, signed: allSigned, signaturesCompleted, totalSignatures };
  } catch (error) {
    logger.error("Autentique: status check error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      signed: false,
      signaturesCompleted: 0,
      totalSignatures: 0,
      error: error instanceof Error ? error.message : "Erro ao consultar Autentique",
    };
  }
}
