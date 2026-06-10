"use server";

import { signIn, signOut, auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { getFailedAttempts } from "@/lib/utils/rate-limit";
import { normalizeCpf } from "@/lib/validators/cpf";
import { isRecaptchaConfigured, verifyRecaptcha } from "@/lib/recaptcha";

const INVALID_CREDENTIALS = "CPF ou senha inválidos. Tente novamente.";

/**
 * Após este número de falhas para o mesmo CPF, o login passa a exigir reCAPTCHA
 * (desafio adaptativo). O contador é o mesmo do `authorize()` (key `login:<cpf>`),
 * então não há dupla contagem — aqui só lemos para decidir o gate.
 */
const CAPTCHA_AFTER_FAILED_ATTEMPTS = 3;

export type LoginState = {
  error?: string;
  /** Quando true, o cliente deve renderizar o widget do reCAPTCHA. */
  captchaRequired?: boolean;
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

/** Exige reCAPTCHA quando configurado e o CPF já acumulou falhas suficientes. */
function captchaRequiredFor(cpf: string): boolean {
  return (
    isRecaptchaConfigured() &&
    getFailedAttempts(`login:${cpf}`) >= CAPTCHA_AFTER_FAILED_ATTEMPTS
  );
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawCpf = String(formData.get("cpf") ?? "");
  const password = String(formData.get("password") ?? "");
  const recaptchaToken = String(formData.get("recaptchaToken") ?? "");
  const cpf = normalizeCpf(rawCpf);

  const headerStore = await headers();
  const ip = clientIp(headerStore);

  // Rate limit por IP: 5 tentativas/min.
  const rl = await rateLimit({ key: `login:${ip}`, limit: 5, windowMs: 60_000 });
  if (!rl.success) {
    return { error: "Muitas tentativas. Aguarde um minuto e tente novamente." };
  }

  // Desafio adaptativo: após N falhas para este CPF, exige reCAPTCHA válido
  // ANTES de checar a senha (encarece o brute force sem atritar o caminho feliz).
  if (captchaRequiredFor(cpf)) {
    const human = await verifyRecaptcha(recaptchaToken, ip);
    if (!human) {
      return {
        error: "Confirme que você não é um robô e tente novamente.",
        captchaRequired: true,
      };
    }
  }

  try {
    await signIn("credentials", { cpf: rawCpf, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      // A falha já foi contabilizada dentro do authorize(); reavalia o gate.
      return { error: INVALID_CREDENTIALS, captchaRequired: captchaRequiredFor(cpf) };
    }
    throw error;
  }

  // Sucesso — limpa o limite por IP e o cookie de tenant ativo.
  await resetRateLimit(`login:${ip}`);
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.delete("x-active-tenant");

  const session = await auth();
  if (!session) return { error: INVALID_CREDENTIALS };

  if (session.user.isSuperAdmin && !session.activeTenantId) redirect("/admin");
  if (session.activeTenantId) redirect("/painel");
  if (session.availableTenants.length === 0) redirect("/no-access");
  redirect("/select-tenant");
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
