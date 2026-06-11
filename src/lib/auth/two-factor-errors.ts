import { CredentialsSignin } from "@auth/core/errors";

/**
 * Códigos sinalizados pelo authorize() ao loginAction quando a senha está certa
 * mas falta o 2FA. O NextAuth mascara a MENSAGEM de erros do authorize, mas
 * re-lança a instância de AuthError ao chamador server-side (signIn em raw mode),
 * então o `code` chega ao loginAction (ver @auth/core index.js: isAuthError &&
 * isRaw → throw error).
 */
export const TWO_FACTOR_REQUIRED_CODE = "two_factor_required";
export const TWO_FACTOR_INVALID_CODE = "two_factor_invalid";

/** Senha correta, mas o usuário tem 2FA e ainda não enviou o código. */
export class TwoFactorRequiredError extends CredentialsSignin {
  override code = TWO_FACTOR_REQUIRED_CODE;
}

/** Senha correta, mas o código 2FA (TOTP ou backup) é inválido. */
export class TwoFactorInvalidError extends CredentialsSignin {
  override code = TWO_FACTOR_INVALID_CODE;
}
