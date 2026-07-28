import type { Prisma } from "@prisma/client";

/**
 * Slug canônico do tipo de serviço: minúsculo, sem acento, separado por hífen.
 * É a chave da unique `(tenant_id, slug)` — e é ela que faz "Troca de Tela",
 * "troca de tela" e "TROCA DE TELA" serem o MESMO tipo. Mesma normalização do
 * backfill (migração `service_type_entity_backfill`).
 */
export function slugifyServiceType(rawName: string): string {
  return rawName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Resolve o `serviceTypeId` a partir do que o formulário mandou, na ordem:
 * tipo selecionado (`serviceTypeId`) → criar novo (`newServiceTypeName`) →
 * texto legado (`serviceType`). Espelha `resolveBrandId`.
 *
 * Auditoria 2026-07-25 (item 17): o tipo era texto livre e as cinco operações
 * "por tipo" casavam por igualdade exata de string — "Troca de Tela" ≠ "troca
 * de tela". O reajuste em massa pegava metade dos serviços e o filtro escondia
 * a outra metade, com os dois aparecendo na lista com o mesmo nome aos olhos de
 * quem lê. A entidade `ServiceType` já existia no schema desde 2026-05-16 e
 * estava morta (0 linhas em produção).
 *
 * Recebe o `tx` já scoped ao tenant (withTenant). Devolve também o nome, que
 * alimenta a coluna-sombra `Service.serviceType` durante a transição.
 */
export async function resolveServiceTypeId(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: { serviceTypeId?: string | null; newServiceTypeName?: string | null; serviceType?: string | null },
): Promise<{ serviceTypeId: string | null; serviceTypeName: string | null }> {
  // 1. Tipo já selecionado (entidade existente).
  if (input.serviceTypeId) {
    const existing = await tx.serviceType.findFirst({
      where: { id: input.serviceTypeId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (existing) return { serviceTypeId: existing.id, serviceTypeName: existing.name };
    // id inválido cai no fallback abaixo (não estoura).
  }

  // 2. Nome cru: da criação inline (newServiceTypeName) ou do texto legado.
  const rawName = (input.newServiceTypeName ?? input.serviceType ?? "").trim();
  if (!rawName) return { serviceTypeId: null, serviceTypeName: null };

  return findOrCreateServiceTypeByName(tx, tenantId, rawName);
}

/**
 * Find-or-create de tipo de serviço por nome, deduplicando pelo slug canônico.
 * Cria com a grafia exata que o usuário digitou; reencontra qualquer variação
 * de caixa/acento/espaço. Um tipo apagado (soft delete) com o mesmo slug é
 * REVIVIDO em vez de recriado — a unique `(tenant_id, slug)` não filtra
 * `deleted_at`, então recriar estouraria.
 */
export async function findOrCreateServiceTypeByName(
  tx: Prisma.TransactionClient,
  tenantId: string,
  rawName: string,
): Promise<{ serviceTypeId: string; serviceTypeName: string }> {
  const name = rawName.trim();
  const slug = slugifyServiceType(name);

  const existing = await tx.serviceType.findFirst({
    where: { tenantId, slug },
    select: { id: true, name: true, deletedAt: true },
  });

  if (existing) {
    if (existing.deletedAt) {
      const revived = await tx.serviceType.update({
        where: { id: existing.id },
        data: { deletedAt: null, active: true, name },
        select: { id: true, name: true },
      });
      return { serviceTypeId: revived.id, serviceTypeName: revived.name };
    }
    return { serviceTypeId: existing.id, serviceTypeName: existing.name };
  }

  const created = await tx.serviceType.create({
    data: { tenantId, name, slug },
    select: { id: true, name: true },
  });
  return { serviceTypeId: created.id, serviceTypeName: created.name };
}
