"use server";

import { signIn, signOut, auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

export async function loginAction(formData: FormData) {
  const cpf = formData.get("cpf") as string;
  const password = formData.get("password") as string;

  // Rate limit: 5 attempts per IP per minute
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    "unknown";
  const rl = await rateLimit({ key: `login:${ip}`, limit: 5, windowMs: 60_000 });
  if (!rl.success) {
    return { error: "Muitas tentativas. Aguarde um minuto e tente novamente." };
  }

  try {
    await signIn("credentials", {
      cpf,
      password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Credenciais inválidas" };
    }
    throw error;
  }

  // Successful login — reset rate limit for this IP
  await resetRateLimit(`login:${ip}`);

  // Determine where to redirect based on session
  const session = await auth();
  if (!session) return { error: "Credenciais inválidas" };

  if (session.user.isSuperAdmin && !session.activeTenantId) {
    redirect("/admin");
  }
  if (session.activeTenantId) {
    redirect("/");
  }
  if (session.availableTenants.length === 0) {
    redirect("/no-access");
  }
  redirect("/select-tenant");
}

export async function logoutAction() {
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
