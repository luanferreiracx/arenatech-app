import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeInfinitepayHandle } from "@/lib/services/infinitepay-service";

type Db = PrismaClient | Prisma.TransactionClient;

export type InfinitepayConfig = {
  enabled: boolean;
  handle: string;
};

/**
 * Le a config InfinitePay do tenant a partir de TenantIntegration.
 * Retorna null se nao habilitada ou sem handle valido — o chamador decide
 * a mensagem de erro. Deve rodar sob o contexto correto (withTenant no fluxo
 * normal; withAdmin/withTenant pelo tenant da venda no webhook).
 */
export async function getInfinitepayConfig(
  db: Db,
  tenantId: string,
): Promise<InfinitepayConfig | null> {
  const integration = await db.tenantIntegration.findUnique({
    where: { tenantId_provider: { tenantId, provider: "INFINITEPAY" } },
    select: { enabled: true, config: true },
  });
  if (!integration?.enabled) return null;

  const config = integration.config;
  const rawHandle =
    config && typeof config === "object" && "handle" in config
      ? (config as { handle?: unknown }).handle
      : null;
  if (typeof rawHandle !== "string") return null;

  const handle = normalizeInfinitepayHandle(rawHandle);
  if (!handle) return null;

  return { enabled: true, handle };
}
