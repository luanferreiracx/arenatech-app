/**
 * Verificacao de 2FA para acoes sensiveis (step-up auth) — fora do fluxo de
 * login. Reusa a mesma logica do login (decifra segredo, valida TOTP, fallback
 * pra backup code de uso unico), mas exposta como helper para procedures tRPC
 * que precisam re-confirmar a identidade do usuario (ex.: saque DePix).
 *
 * @see src/server/auth.ts (fluxo de login) e src/lib/auth/two-factor.ts.
 */
import { decryptSecret, verifyTotpReturningCounter } from "@/lib/auth/two-factor";
import { consumeBackupCodeAtomic, markTotpCounterUsedAtomic } from "@/server/services/backup-code.service";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";

export type StepUpResult =
  | { ok: true }
  /** Usuario nao tem 2FA habilitado — acao deve ser bloqueada/orientada. */
  | { ok: false; reason: "not_enrolled" }
  /** Codigo TOTP / backup invalido. */
  | { ok: false; reason: "invalid_code" };

/**
 * Confirma um codigo 2FA (TOTP ou backup code) para o usuario dado.
 *
 * - `not_enrolled`: o usuario nao tem 2FA ativo. O caller decide a politica
 *   (no saque DePix, bloqueamos e orientamos a habilitar).
 * - `invalid_code`: codigo errado/expirado e nao casou com nenhum backup code.
 * - backup code valido eh CONSUMIDO (removido do array) — uso unico.
 *
 * Segredo corrompido (ex.: rotacao do NEXTAUTH_SECRET) eh tratado como
 * `invalid_code`, igual ao login — recuperacao via reset do 2FA.
 */
export async function verifyUserTwoFactor(
  userId: string,
  code: string,
): Promise<StepUpResult> {
  const trimmed = code.trim();
  const user = await withAdmin((tx) =>
    tx.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
      },
    }),
  );

  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return { ok: false, reason: "not_enrolled" };
  }
  if (!trimmed) {
    return { ok: false, reason: "invalid_code" };
  }

  let secret: string;
  try {
    secret = decryptSecret(user.twoFactorSecret);
  } catch (err) {
    logger.error("2FA step-up: falha ao decifrar segredo — tratando como invalido", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "invalid_code" };
  }

  // TOTP com ANTI-REPLAY (P2-1): só aceita se o passo (counter) for novo —
  // o mesmo código não autoriza duas operações (ex.: dois saques) na janela.
  const counter = verifyTotpReturningCounter(secret, trimmed);
  if (counter !== null) {
    const fresh = await withAdmin((tx) => markTotpCounterUsedAtomic(tx, userId, counter));
    if (!fresh) {
      logger.warn("2FA step-up: TOTP reusado (replay) — rejeitado", { userId });
      return { ok: false, reason: "invalid_code" };
    }
    return { ok: true };
  }

  // Fallback: backup code de uso unico — consumido ATOMICAMENTE (anti-replay
  // em requisicoes concorrentes; ver backup-code.service).
  const consumed = await withAdmin((tx) => consumeBackupCodeAtomic(tx, userId, trimmed));
  if (!consumed) {
    return { ok: false, reason: "invalid_code" };
  }
  logger.info("2FA step-up: backup code usado", { userId });
  return { ok: true };
}
