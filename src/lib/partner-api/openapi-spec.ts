/**
 * Gerador do OpenAPI 3.0 da API de parceiros (ADR 0057). A spec é DERIVADA dos
 * schemas Zod (request + response) — fonte única, impossível divergir do código.
 * O `scripts/gen-partner-openapi.ts` escreve isto em docs/openapi/partner-api.yaml,
 * e o `openapi:check` (CI) falha se o arquivo commitado estiver desatualizado.
 */
import { z } from "zod";
import { PARTNER_SCOPES, TRANSACTION_READ_SCOPES } from "@/lib/partner-api/scopes";
import { partnerDepositSchema, partnerWithdrawSchema } from "@/lib/partner-api/write-schemas";
import {
  partnerTransactionResponseSchema,
  partnerDepositResultSchema,
  partnerWithdrawResultSchema,
  partnerErrorResponseSchema,
  partnerWebhookEventSchema,
} from "@/lib/partner-api/openapi-schemas";

/** Versão da spec (bump ao mudar o contrato de forma quebrante → v2 no path). */
export const PARTNER_API_VERSION = "1.0.0";

// Cada schema reutilizável vira um component com id estável (referenciável por $ref).
const COMPONENTS: Array<[string, z.ZodType]> = [
  ["PartnerTransaction", partnerTransactionResponseSchema],
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

const IDEMPOTENCY_HEADER = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  schema: { type: "string", format: "uuid" },
  description: "UUID por intenção. Repetir a mesma chamada com a mesma chave retorna o mesmo resultado, sem duplicar.",
};

function op(args: {
  summary: string;
  scope: string | string[];
  responses: Record<string, unknown>;
  requestBodyId?: string;
  parameters?: unknown[];
  idempotent?: boolean;
}) {
  const parameters = [...(args.parameters ?? []), ...(args.idempotent ? [IDEMPOTENCY_HEADER] : [])];
  const scopeText = (Array.isArray(args.scope) ? args.scope : [args.scope])
    .map((s) => `\`${s}\``)
    .join(" ou ");
  return {
    summary: args.summary,
    security: [{ bearerAuth: [] }],
    description: `Escopo necessário: ${scopeText}.`,
    ...(parameters.length ? { parameters } : {}),
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
        "API REST para parceiros movimentarem o DePix de um tenant: criar depósito " +
        "(QR PIX), sacar (PIX) e consultar o status da transação criada. Autentique com " +
        "`Authorization: Bearer at_<prefix>_<secret>` (API-key emitida pelo admin do " +
        "tenant). Webhooks de saída assinados (HMAC).",
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
            `${PARTNER_SCOPES.DEPIX_DEPOSIT}, ${PARTNER_SCOPES.DEPIX_WITHDRAW}.`,
        },
      },
      schemas,
    },
    paths: {
      "/api/v1/partner/depix/transactions/{id}": {
        get: op({
          summary: "Status de uma transação (depósito/saque criado)",
          scope: TRANSACTION_READ_SCOPES,
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
          idempotent: true,
          responses: {
            "201": jsonResponse("PartnerDepositResult", "Depósito criado (QR)."),
            "400": jsonResponse("PartnerError", "Corpo JSON inválido."),
            "422": ERR,
          },
        }),
      },
      "/api/v1/partner/depix/withdrawals": {
        post: op({
          summary: "Sacar (PIX)",
          scope: PARTNER_SCOPES.DEPIX_WITHDRAW,
          requestBodyId: "PartnerWithdrawRequest",
          idempotent: true,
          responses: {
            "201": jsonResponse("PartnerWithdrawResult", "Saque iniciado/concluído."),
            "400": jsonResponse("PartnerError", "Corpo JSON inválido ou cap diário de saque excedido."),
            "412": jsonResponse("PartnerError", "Carteira non-custodial (use o painel)."),
            "422": ERR,
          },
        }),
      },
    },
  };
}
