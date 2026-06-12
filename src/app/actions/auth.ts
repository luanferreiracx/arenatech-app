"use server";

import { signIn, signOut, auth } from "@/server/auth";
import { redirect, unstable_rethrow } from "next/navigation";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { getFailedAttempts } from "@/lib/utils/rate-limit";
import { normalizeCpf } from "@/lib/validators/cpf";
import { isTurnstileConfigured, verifyTurnstile } from "@/lib/turnstile";
import { TWO_FACTOR_REQUIRED_CODE, TWO_FACTOR_INVALID_CODE } from "@/lib/auth/two-factor-errors";
import { RATE_LIMITED_CODE } from "@/lib/auth/login-errors";
import { logger } from "@/lib/logger";

const INVALID_CREDENTIALS = "CPF ou senha inválidos. Tente novamente.";
const GENERIC_ERROR = "Não foi possível entrar agora. Tente novamente em instantes.";

/**
 * Após este número de falhas para o mesmo CPF, o login passa a exigir o desafio
 * do Turnstile (adaptativo). O contador é o mesmo do `authorize()` (key
 * `login:<cpf>`), então não há dupla contagem — aqui só lemos para decidir o gate.
 */
const CAPTCHA_AFTER_FAILED_ATTEMPTS = 3;

export type LoginState = {
  error?: string;
  /** Quando true, o cliente deve renderizar o widget do Turnstile. */
  captchaRequired?: boolean;
  /** Quando true, a senha está certa mas falta o código 2FA — pede o código. */
  twoFactorRequired?: boolean;
};

function clientIp(headerStore: Headers): string {
  // Lê o ÚLTIMO IP do X-Forwarded-For — o appendado pelo nginx confiável à nossa
  // frente. O primeiro elemento é controlado pelo cliente (spoofável).
  return (
    headerStore.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    headerStore.get("x-real-ip") ??
    "unknown"
  );
}

/** Exige Turnstile quando configurado e o CPF já acumulou falhas suficientes. */
function captchaRequiredFor(cpf: string): boolean {
  return (
    isTurnstileConfigured() &&
    getFailedAttempts(`login:${cpf}`) >= CAPTCHA_AFTER_FAILED_ATTEMPTS
  );
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    return await runLogin(formData);
  } catch (error) {
    // redirect()/notFound() usam exceções de controle de fluxo — deixa passar.
    unstable_rethrow(error);
    // Qualquer outro erro inesperado (fora do signIn já tratado): loga e mostra
    // mensagem amigável, nunca o error boundary global ("Algo deu errado").
    logger.error("loginAction: erro inesperado", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: GENERIC_ERROR };
  }
}

async function runLogin(formData: FormData): Promise<LoginState> {
  const rawCpf = String(formData.get("cpf") ?? "");
  const password = String(formData.get("password") ?? "");
  const turnstileToken = String(formData.get("turnstileToken") ?? "");
  const totp = String(formData.get("totp") ?? "");
  const cpf = normalizeCpf(rawCpf);

  const headerStore = await headers();
  const ip = clientIp(headerStore);
  const hasClientIp = ip !== "unknown";

  // Rate limit por IP: 5 tentativas/min. Só aplica quando temos um IP atribuível
  // (atrás do nginx). Sem proxy/headers, todos cairiam no bucket "unknown" e um
  // usuário bloquearia os outros — então pulamos.
  if (hasClientIp) {
    const rl = await rateLimit({ key: `login:${ip}`, limit: 5, windowMs: 60_000 });
    if (!rl.success) {
      return { error: "Muitas tentativas. Aguarde um minuto e tente novamente." };
    }
  }

  // Desafio adaptativo: após N falhas para este CPF, exige Turnstile válido
  // ANTES de checar a senha (encarece o brute force sem atritar o caminho feliz).
  if (captchaRequiredFor(cpf)) {
    const human = await verifyTurnstile(turnstileToken, ip);
    if (!human) {
      return {
        error: "Confirme que você não é um robô e tente novamente.",
        captchaRequired: true,
      };
    }
  }

  try {
    await signIn("credentials", { cpf: rawCpf, password, totp, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      // authorize() re-lança erros tipados com um `code` (re-throw em raw mode).
      const code = (error as { code?: string }).code;
      if (code === TWO_FACTOR_REQUIRED_CODE) {
        // Senha certa — agora pede o código do app.
        return { twoFactorRequired: true };
      }
      if (code === TWO_FACTOR_INVALID_CODE) {
        return { twoFactorRequired: true, error: "Código de verificação inválido. Tente novamente." };
      }
      if (code === RATE_LIMITED_CODE) {
        return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
      }
      // A falha já foi contabilizada dentro do authorize(); reavalia o gate.
      return { error: INVALID_CREDENTIALS, captchaRequired: captchaRequiredFor(cpf) };
    }

    // Erro inesperado no authorize/signIn: loga e mostra mensagem amigável, em
    // vez de vazar para o error boundary global ("Algo deu errado").
    logger.error("loginAction: erro inesperado no signIn", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: GENERIC_ERROR };
  }

  // Sucesso — limpa o limite por IP e o cookie de tenant ativo.
  if (hasClientIp) await resetRateLimit(`login:${ip}`);
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.delete("x-active-tenant");

  // O cookie de sessão recém-criado pelo signIn() ainda não é legível por auth()
  // nesta mesma request. Redirecionamos para /login: numa nova request (já com o
  // cookie), o proxy roteia o usuário autenticado para o destino correto
  // (painel / select-tenant / admin / no-access) — fonte única dessa lógica.
  redirect("/login");
}

export async function logoutAction() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.delete("x-active-tenant");
  await signOut({ redirect: false });
  redirect("/login");
}

/**
 * Switch active tenant. Updates JWT by re-signing in.
 * NextAuth v5 doesn't expose a direct way to update JWT claims,
 * so we use unstable_update or a re-sign approach.
 */
export async function switchTenantAction(tenantId: string) {
  const session = await auth();
  if (!session) redirect("/login");

  const hasTenant = session.availableTenants.some((t) => t.id === tenantId);
  if (!hasTenant) {
    return { error: "Sem acesso a este tenant" };
  }

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.set("x-active-tenant", tenantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return { success: true };
}
