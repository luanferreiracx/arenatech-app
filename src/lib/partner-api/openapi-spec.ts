/**
 * Gerador do OpenAPI 3.0 da API de parceiros (ADR 0057). A spec é DERIVADA dos
 * schemas Zod (request + response) — fonte única, impossível divergir do código.
 * O `scripts/gen-partner-openapi.ts` escreve isto em docs/openapi/partner-api.yaml,
 * e o `openapi:check` (CI) falha se o arquivo commitado estiver desatualizado.
 */
import { z } from "zod";
import { PARTNER_SCOPES } from "@/lib/partner-api/scopes";
import { partnerDepositSchema, partnerWithdrawSchema } from "@/lib/partner-api/write-schemas";
import {
  partnerBalanceResponseSchema,
  partnerTransactionResponseSchema,
  partnerTransactionListResponseSchema,
  partnerDepositResultSchema,
  partnerWithdrawResultSchema,
  partnerErrorResponseSchema,
  partnerWebhookEventSchema,
} from "@/lib/partner-api/openapi-schemas";

/** Versão da spec (bump ao mudar o contrato de forma quebrante → v2 no path). */
export const PARTNER_API_VERSION = "1.0.0";

// Cada schema reutilizável vira um component com id estável (referenciável por $ref).
const COMPONENTS: Array<[string, z.ZodType]> = [
  ["PartnerBalance", partnerBalanceResponseSchema],
  ["PartnerTransaction", partnerTransactionResponseSchema],
  ["PartnerTransactionList", partnerTransactionListResponseSchema],
  ["PartnerDepositRequest", partnerDepositSchema],
  ["PartnerDepositResult", partnerDepositResultSchema],
  ["PartnerWithdrawRequest", partnerWithdrawSchema],
  ["PartnerWithdrawResult", partnerWithdrawResultSchema],
  ["PartnerError", partnerErrorResponseSchema],
  ["PartnerWebhookEvent", partnerWebhookEventSchema],
];

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });

function jsonResponse(id: string, description: string) {
  return { description, content: { "application/json": { schema: ref(id) } } };
}

function jsonBody(id: string) {
  return { required: true, content: { "application/json": { schema: ref(id) } } };
}

const ERR = jsonResponse("PartnerError", "Erro");
const COMMON_ERRORS = {
  "401": jsonResponse("PartnerError", "API-key ausente/inválida/revogada."),
  "403": jsonResponse("PartnerError", "Escopo insuficiente."),
  "429": jsonResponse("PartnerError", "Acima da quota."),
  "503": jsonResponse("PartnerError", "Serviço temporariamente indisponível."),
};

function op(args: {
  summary: string;
  scope: string;
  responses: Record<string, unknown>;
  requestBodyId?: string;
  parameters?: unknown[];
}) {
  return {
    summary: args.summary,
    security: [{ bearerAuth: [] }],
    description: `Escopo necessário: \`${args.scope}\`.`,
    ...(args.parameters ? { parameters: args.parameters } : {}),
    ...(args.requestBodyId ? { requestBody: jsonBody(args.requestBodyId) } : {}),
    responses: { ...args.responses, ...COMMON_ERRORS },
  };
}

/** Monta o objeto OpenAPI 3.0 completo. */
export function buildOpenApiSpec(serverUrl = "https://app.arenatechpi.com.br") {
  // Components via registry → $ref entre schemas resolvidos.
  const reg = z.registry<{ id: string }>();
  for (const [id, schema] of COMPONENTS) reg.add(schema, { id });
  const { schemas } = z.toJSONSchema(reg, {
    target: "openapi-3.0",
    uri: (id) => `#/components/schemas/${id}`,
  }) as { schemas: Record<string, unknown> };
  // Remove o `$id` que o toJSONSchema injeta (OpenAPI não precisa).
  for (const s of Object.values(schemas)) {
    if (s && typeof s === "object") delete (s as Record<string, unknown>).$id;
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Arena Tech — API de Parceiros (DePix)",
      version: PARTNER_API_VERSION,
      description:
        "API REST para parceiros consumirem o DePix de um tenant: saldo, extrato, " +
        "depósito e saque. Autentique com `Authorization: Bearer at_<prefix>_<secret>` " +
        "(API-key emitida pelo admin do tenant). Webhooks de saída assinados (HMAC).",
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "API-key do parceiro no formato `at_<prefix>_<secret>`. Escopos: " +
            `${PARTNER_SCOPES.DEPIX_READ}, ${PARTNER_SCOPES.DEPIX_DEPOSIT}, ${PARTNER_SCOPES.DEPIX_WITHDRAW}.`,
        },
      },
      schemas,
    },
    paths: {
      "/api/v1/partner/depix/balance": {
        get: op({
          summary: "Saldo DePix do tenant",
          scope: PARTNER_SCOPES.DEPIX_READ,
          responses: { "200": jsonResponse("PartnerBalance", "Saldo atual.") },
        }),
      },
      "/api/v1/partner/depix/transactions": {
        get: op({
          summary: "Extrato paginado",
          scope: PARTNER_SCOPES.DEPIX_READ,
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", minimum: 0 }, description: "0-based." },
            { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "kind", in: "query", schema: { type: "string", enum: ["DEPOSIT", "WITHDRAW"] } },
            { name: "status", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": jsonResponse("PartnerTransactionList", "Página de transações.") },
        }),
      },
      "/api/v1/partner/depix/transactions/{id}": {
        get: op({
          summary: "Detalhe de uma transação",
          scope: PARTNER_SCOPES.DEPIX_READ,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": jsonResponse("PartnerTransaction", "Transação."),
            "404": jsonResponse("PartnerError", "Não encontrada (ou de outro tenant)."),
          },
        }),
      },
      "/api/v1/partner/depix/deposits": {
        post: op({
          summary: "Criar depósito (gerar QR PIX)",
          scope: PARTNER_SCOPES.DEPIX_DEPOSIT,
          requestBodyId: "PartnerDepositRequest",
          responses: {
            "201": jsonResponse("PartnerDepositResult", "Depósito criado (QR)."),
            "422": ERR,
          },
        }),
      },
      "/api/v1/partner/depix/withdrawals": {
        post: op({
          summary: "Sacar (PIX ou on-chain)",
          scope: PARTNER_SCOPES.DEPIX_WITHDRAW,
          requestBodyId: "PartnerWithdrawRequest",
          responses: {
            "201": jsonResponse("PartnerWithdrawResult", "Saque iniciado/concluído."),
            "412": jsonResponse("PartnerError", "Carteira non-custodial (use o painel)."),
            "422": ERR,
          },
        }),
      },
    },
  };
}
