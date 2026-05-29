import { logger } from "@/lib/logger";

/**
 * Consulta de NF-e por chave de acesso via API MeuDANFE.
 *
 * Fluxo (paridade Laravel NFEService::validarNFe):
 *   1. PUT /v2/fd/add/{chave}  — solicita busca da nota na SEFAZ
 *   2. aguarda ~1s
 *   3. GET /v2/fd/get/da/{chave} — retorna o DANFE em PDF (base64)
 *
 * Sem MEUDANFE_API_KEY, retorna mock para desenvolvimento.
 */

export interface NfeValidateResult {
  success: boolean;
  /** PDF do DANFE em base64 (quando success=true) */
  pdfBase64?: string;
  fileName?: string;
  error?: string;
  message?: string;
}

const MEUDANFE_BASE = "https://api.meudanfe.com.br";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function validateNfe(chave: string): Promise<NfeValidateResult> {
  const key = chave.trim();

  if (!/^\d{44}$/.test(key)) {
    return {
      success: false,
      error: "Chave de acesso invalida! Deve conter exatamente 44 digitos numericos.",
    };
  }

  const apiKey = process.env.MEUDANFE_API_KEY;
  if (!apiKey) {
    logger.info("NFe: mock mode (no credentials)", { chave: key });
    return getMockResult(key);
  }

  logger.info("NFe: validating", { chave: key });

  try {
    // PASSO 1: adicionar a nota (busca SEFAZ)
    await fetch(`${MEUDANFE_BASE}/v2/fd/add/${key}`, {
      method: "PUT",
      headers: {
        "Api-Key": apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });

    // Aguardar conforme documentacao da API
    await sleep(1000);

    // PASSO 2: buscar o PDF do DANFE
    const getResponse = await fetch(`${MEUDANFE_BASE}/v2/fd/get/da/${key}`, {
      method: "GET",
      headers: {
        "Api-Key": apiKey,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!getResponse.ok) {
      const errorData = (await getResponse.json().catch(() => null)) as
        | Record<string, unknown>
        | null;
      const errorMessage =
        (typeof errorData?.["error"] === "string" && errorData["error"]) ||
        (typeof errorData?.["message"] === "string" && errorData["message"]) ||
        "Erro desconhecido";
      logger.error("NFe: get error", { chave: key, status: getResponse.status });
      return {
        success: false,
        error: `Erro ao buscar nota (HTTP ${getResponse.status}): ${errorMessage}`,
      };
    }

    const data = (await getResponse.json()) as Record<string, unknown>;
    if (data["data"] && typeof data["data"] === "string" && data["data"].length > 0) {
      return {
        success: true,
        pdfBase64: data["data"],
        fileName: typeof data["name"] === "string" ? data["name"] : `nfe-${key}.pdf`,
      };
    }

    return { success: false, error: "PDF nao disponivel na resposta da API" };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { success: false, error: "Timeout ao consultar a NF-e" };
    }
    logger.error("NFe: error", {
      chave: key,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: "Erro ao processar validacao",
      message: error instanceof Error ? error.message : undefined,
    };
  }
}

/**
 * Mock dev: gera um PDF minimo valido em base64 com a chave, para a UI poder
 * exercitar o fluxo de download sem credenciais.
 */
function getMockResult(chave: string): NfeValidateResult {
  const pdf = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 90>>stream
BT /F1 10 Tf 20 80 Td (DANFE MOCK - Arena Tech) Tj 0 -20 Td (Chave: ${chave}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF`;
  const pdfBase64 = Buffer.from(pdf, "utf-8").toString("base64");
  return { success: true, pdfBase64, fileName: `nfe-${chave}.pdf` };
}
