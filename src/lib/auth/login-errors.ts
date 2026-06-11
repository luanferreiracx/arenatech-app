import { CredentialsSignin } from "next-auth";

/**
 * Erro de rate-limit do login. Subclasse de `CredentialsSignin` (AuthError) para
 * que o `@auth/core` re-lance a instância ao chamador (signIn em raw mode) e o
 * `loginAction` consiga distingui-la pelo `code` e mostrar uma mensagem amigável
 * — em vez de um `Error` puro que vazaria para o error boundary ("Algo deu errado").
 *
 * @see docs/decisions/0049-login-turnstile-2fa.md
 */
export const RATE_LIMITED_CODE = "rate_limited";

export class RateLimitedError extends CredentialsSignin {
  override code = RATE_LIMITED_CODE;
  /** Minutos até poder tentar de novo (para a mensagem). */
  readonly retryMinutes: number;

  constructor(retryMinutes: number) {
    super();
    this.retryMinutes = retryMinutes;
  }
}
