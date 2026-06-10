/**
 * Política de obrigatoriedade do 2FA.
 *
 * O 2FA é obrigatório para superadmin e admins de tenant, MAS a obrigatoriedade
 * só é ativada quando `TWO_FACTOR_ENFORCE=true` (e o 2FA está configurável).
 * Isso permite ligar o enforcement em produção de forma coordenada (após os
 * admins terem chance de configurar) sem quebrar ambientes onde não se aplica
 * (ex.: E2E). A proteção de fato vem do login exigir TOTP de quem já tem 2FA;
 * o barrier apenas empurra os admins para concluírem o enrollment.
 */
const ADMIN_TENANT_ROLES = new Set(["OWNER", "MANAGER", "ADMIN", "owner", "manager", "admin"]);

export function isTwoFactorEnforced(): boolean {
  // 2FA é "configurável" onde a auth funciona (segredo cifrado com chave
  // derivada do NEXTAUTH_SECRET). Checagem inline para não puxar otpauth/crypto
  // ao bundle do proxy.
  return process.env.TWO_FACTOR_ENFORCE === "true" && Boolean(process.env.NEXTAUTH_SECRET);
}

type SessionLike = {
  user: { isSuperAdmin: boolean };
  availableTenants: Array<{ role: string }>;
};

/** True se o usuário ocupa um papel para o qual o 2FA é obrigatório. */
export function sessionRequiresTwoFactor(session: SessionLike): boolean {
  if (session.user.isSuperAdmin) return true;
  return session.availableTenants.some((t) => ADMIN_TENANT_ROLES.has(t.role));
}
