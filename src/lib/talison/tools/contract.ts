/**
 * Contrato das tools do Talison.
 *
 * Cada tool é uma função tipada que recebe args já validados por Zod e um
 * contexto com a transação Prisma RLS-scoped. O resultado é estruturado e
 * traz o dado de negócio já formatado pra o modelo COPIAR — nunca inventar.
 *
 * O JSON Schema exposto ao modelo é derivado do schema Zod (z.toJSONSchema),
 * então a fonte única da verdade é o Zod: muda o schema, muda o que o modelo
 * vê e o que é validado.
 */

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { LlmToolDefinition } from "@/lib/talison/types";

/** Transação Prisma com RLS já aplicada (vinda de withTenant/withAdmin). */
export type TalisonTx = Prisma.TransactionClient;

/** Contexto repassado a toda tool durante uma rodada do agente. */
export type TalisonToolContext = {
  tenantId: string;
  /** Slug do tenant (chave estável, ex.: "arena-tech"). Usado para derivar
   *  recursos por-tenant (URL do catálogo) e gatear o global central (T1). */
  tenantSlug: string;
  /** É o tenant central (arena-tech)? Só ele usa os globais de infra (grupo de
   *  alerta via env); os demais são fail-safe até terem config própria. */
  isCentralTenant: boolean;
  /** Conversa atual — telefone do contato, cliente vinculado, id da conversa. */
  conversation: {
    id: string;
    contactPhone: string;
    contactName: string | null;
    customerId: string | null;
    externalId: string | null;
  };
  /** Roda uma leitura/escrita com RLS do tenant. */
  withTenant: <T>(fn: (tx: TalisonTx) => Promise<T>) => Promise<T>;
};

/**
 * Resultado de uma tool. `ok:false` não é exceção — é um caminho normal
 * ("não encontrei a OS"), e o texto em `reason` vira contexto pro modelo
 * decidir o próximo passo (ex.: transferir pra humano).
 */
export type TalisonToolResult =
  | { ok: true; data: Record<string, unknown>; display: string }
  | { ok: false; reason: string };

/** Uma tool do Talison: schema Zod + descrição + executor. */
export type TalisonTool<Schema extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  schema: Schema;
  /** Esta tool escreve no banco? (telemetria/auditoria; default false). */
  mutates?: boolean;
  execute: (
    args: z.infer<Schema>,
    ctx: TalisonToolContext,
  ) => Promise<TalisonToolResult>;
};

/** Deriva a definição que o modelo recebe (nome, descrição, JSON Schema). */
export function toToolDefinition(tool: TalisonTool): LlmToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.schema) as Record<string, unknown>,
  };
}

/** Formata centavos/Decimal em BRL pronto pro cliente ("R$ 1.234,56"). */
export function formatBRL(value: number | string): string {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return "valor indisponível";
  // toLocaleString usa espaço não-quebrável (U+00A0) e pode usar U+202F nos
  // separadores; normaliza pra espaço comum — previsível no WhatsApp e em testes.
  return numeric
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    .replace(/[\u00a0\u202f]/g, " ");
}
