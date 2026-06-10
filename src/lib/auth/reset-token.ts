import { createHash, randomUUID } from "crypto";

/**
 * Password reset tokens are stored hashed (SHA-256), never in plaintext.
 *
 * The plaintext token (a UUID) is sent to the user via email; only its hash is
 * persisted in `password_reset_tokens`. A read-only database breach therefore
 * cannot be turned into account takeover — the attacker would need to reverse
 * SHA-256 to recover a usable token.
 *
 * SHA-256 (not bcrypt) is appropriate here: the token is a 122-bit random UUID,
 * so it has no low-entropy guessing surface to defend against — we only need a
 * fast one-way function to avoid storing the secret at rest.
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generate a fresh plaintext reset token to send to the user. */
export function generateResetToken(): string {
  return randomUUID();
}
