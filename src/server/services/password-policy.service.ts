import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { validatePasswordPolicy, type PasswordPolicy } from "@/lib/password";

/**
 * Defaults da politica de senha — espelham os @default de
 * TenantSecuritySettings no schema. Usados quando o tenant ainda nao tem a
 * linha (mesma logica do getSecurity no settings router).
 */
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minPasswordLength: 8,
  requireUppercase: false,
  requireNumber: true,
  requireSpecialChar: false,
};

/**
 * Carrega a politica de senha do tenant (com defaults) e valida a senha nova.
 * Lanca TRPCError BAD_REQUEST se violar — chamado nas trocas de senha (D4).
 * Deve rodar sob o contexto do tenant (withTenant/withAdmin com tenantId).
 */
export async function enforcePasswordPolicy(
  tx: PrismaClient,
  tenantId: string,
  password: string,
): Promise<void> {
  const settings = await tx.tenantSecuritySettings.findUnique({
    where: { tenantId },
    select: {
      minPasswordLength: true,
      requireUppercase: true,
      requireNumber: true,
      requireSpecialChar: true,
    },
  });
  const policy: PasswordPolicy = settings ?? DEFAULT_PASSWORD_POLICY;
  const error = validatePasswordPolicy(password, policy);
  if (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error });
  }
}

/**
 * Política de senha EFETIVA de um usuário: como a senha é global (uma só serve
 * todos os tenants do usuário), exige a MAIS ESTRITA entre as políticas dos
 * tenants a que ele pertence (cada tenant = sua linha de settings OU o DEFAULT).
 * Usado no reset de senha público (sem contexto de tenant), para que a
 * recuperação não fure a política que o `changePassword` aplica (D4). Sem
 * membership → DEFAULT. Deve rodar sob `withAdmin` (lê cross-tenant, BYPASSRLS).
 */
export async function resolveUserPasswordPolicy(
  tx: PrismaClient,
  userId: string,
): Promise<PasswordPolicy> {
  const memberships = await tx.userTenant.findMany({
    where: { userId },
    select: { tenantId: true },
  });
  if (memberships.length === 0) return DEFAULT_PASSWORD_POLICY;

  const rows = await tx.tenantSecuritySettings.findMany({
    where: { tenantId: { in: memberships.map((m) => m.tenantId) } },
    select: {
      tenantId: true,
      minPasswordLength: true,
      requireUppercase: true,
      requireNumber: true,
      requireSpecialChar: true,
    },
  });
  const byTenant = new Map(rows.map((r) => [r.tenantId, r]));

  // Política efetiva por tenant (settings ou DEFAULT), depois a mais estrita:
  // maior comprimento mínimo + OR de cada requisito booleano.
  return memberships
    .map((m) => byTenant.get(m.tenantId) ?? DEFAULT_PASSWORD_POLICY)
    .reduce<PasswordPolicy>(
      (acc, p) => ({
        minPasswordLength: Math.max(acc.minPasswordLength, p.minPasswordLength),
        requireUppercase: acc.requireUppercase || p.requireUppercase,
        requireNumber: acc.requireNumber || p.requireNumber,
        requireSpecialChar: acc.requireSpecialChar || p.requireSpecialChar,
      }),
      { minPasswordLength: 0, requireUppercase: false, requireNumber: false, requireSpecialChar: false },
    );
}
