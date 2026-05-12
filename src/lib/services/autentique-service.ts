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
  if (!apiKey) return null;
  return {
    apiKey,
    apiUrl: process.env.AUTENTIQUE_API_URL ?? "https://api.autentique.com.br/v2/graphql",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

export function formatWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;
  return `+${digits}`;
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
    // Build the GraphQL mutation
    const signersGql = signers
      .map(
        (s) =>
          `{ action: SIGN, positions: [{ x: "50", y: "80", z: "1" }], email: "", name: "${s.name}" }`,
      )
      .join(", ");

    const mutation = `
      mutation {
        createDocument(
          document: {
            name: "${title.replace(/"/g, '\\"')}"
          }
          signers: [${signersGql}]
          file: null
        ) {
          id
          name
          signatures {
            public_id
            name
            action { name }
            link { short_link }
            signed { created_at }
          }
        }
      }
    `;

    // Build multipart form
    const formData = new FormData();
    formData.append("operations", JSON.stringify({ query: mutation }));
    formData.append("map", JSON.stringify({ "0": ["variables.file"] }));
    formData.append(
      "0",
      new Blob([new Uint8Array(pdfContent)], { type: "application/pdf" }),
      `${title}.pdf`,
    );

    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `Autentique HTTP ${response.status}: ${body.substring(0, 200)}`,
      };
    }

    const json = (await response.json()) as Record<string, unknown>;
    const data = json["data"] as Record<string, unknown> | undefined;
    const createDocument = data?.["createDocument"] as Record<string, unknown> | undefined;

    if (!createDocument) {
      return { success: false, error: "Resposta inesperada do Autentique" };
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
