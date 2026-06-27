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
