import type { PrismaClient } from "@prisma/client"

/**
 * Registra uma entrada em audit_logs para mudanças sensíveis.
 *
 * `before` e `after` viram payload JSON. Use `pickChanges` para registrar
 * apenas os campos que efetivamente mudaram, evitando ruído.
 *
 * Convenção:
 * - action: verbo no past tense lowercase (created/updated/deleted/restored)
 * - entity: nome do recurso (tenant_general/tenant_assistance/tenant_fiscal/...)
 * - entityId: PK quando aplicável (para singletons, pode ser o tenantId)
 */
export async function logAudit(
  tx: PrismaClient,
  params: {
    tenantId: string
    userId?: string | null
    action: string
    entity: string
    entityId?: string | null
    payload?: Record<string, unknown>
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId ?? null,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      payload: params.payload ? (params.payload as never) : undefined,
    },
  })
}

/**
 * Compara before vs after e retorna apenas os campos modificados.
 * Útil para reduzir o payload do audit log.
 */
export function pickChanges<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: T,
): { before: Partial<T>; after: Partial<T> } | null {
  if (!before) {
    return { before: {}, after }
  }
  const changedBefore: Partial<T> = {}
  const changedAfter: Partial<T> = {}
  const keys = new Set<keyof T>([...Object.keys(before), ...Object.keys(after)] as (keyof T)[])
  for (const k of keys) {
    if (!Object.is(before[k], after[k])) {
      changedBefore[k] = before[k]
      changedAfter[k] = after[k]
    }
  }
  if (Object.keys(changedAfter).length === 0) return null
  return { before: changedBefore, after: changedAfter }
}
