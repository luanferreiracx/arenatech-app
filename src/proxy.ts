/**
 * Next.js 16 proxy — replaces middleware.ts.
 * Runs in Node.js runtime (not Edge), so it can import bcrypt, Prisma, etc.
 *
 * Handles:
 * - Route protection (default deny — only explicit public routes pass)
 * - Tenant resolution from cookie x-active-tenant or JWT activeTenantId
 * - Header injection of x-tenant-id for downstream tRPC context
 *
 * @see docs/decisions/0003-nextjs-16-migration.md
 */
import { auth } from "@/server/auth";
import { NextResponse } from "next/server";
import { isLandingHost, isPublicCatalogHost, isAppSubdomainHost } from "@/lib/brand-host";
import { isPathAllowed } from "@/lib/modules";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { isTwoFactorEnforced, sessionRequiresTwoFactor } from "@/lib/auth/two-factor-policy";

const PUBLIC_ROUTES = new Set(["/login", "/no-access", "/forgot-password", "/reset-password", "/register"]);

function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_ROUTES.has(pathname) ||
    // Landing publica (marketing) — servida na raiz por host em pdvdepix.app.
    pathname === "/landing" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/cron/") ||
    // Webhooks externos — autenticacao via HMAC interno, sem cookie.
    pathname.startsWith("/api/webhooks/") ||
    // Rotas de midia publica para WhatsApp Cloud API baixar PDFs (HMAC-tokenized).
    // Meta precisa acessar sem cookies de auth.
    pathname.startsWith("/api/whatsapp-media/") ||
    pathname.startsWith("/catalog") ||
    pathname.startsWith("/os/") ||
    pathname.startsWith("/quote/") ||
    pathname.startsWith("/pay/") ||
    pathname.startsWith("/receipt/") ||
    pathname.startsWith("/register/")
  );
}

function isNoTenantRoute(pathname: string): boolean {
  return (
    pathname === "/select-tenant" ||
    pathname === "/switch-tenant" ||
    pathname === "/logout" ||
    pathname === "/setup-2fa" ||
    pathname.startsWith("/admin")
  );
}

function isPasswordChangeRoute(pathname: string): boolean {
  return pathname === "/change-password" || pathname.startsWith("/api/trpc/auth.changePassword");
}

function isTwoFactorSetupRoute(pathname: string): boolean {
  return pathname === "/setup-2fa" || pathname === "/logout";
}

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Monta uma URL de redirect no HOST REAL da requisicao. `req.url` dentro do
  // wrapper auth() nao reflete o Host header (usa o host interno/NEXTAUTH_URL),
  // o que vazava redirects de pdvdepix.app -> app.arenatechpi. Aqui priorizamos
  // o header Host (que o Nginx encaminha) + o protocolo encaminhado.
  const selfUrl = (path: string): URL => {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!host) return new URL(path, req.url);
    const proto =
      req.headers.get("x-forwarded-proto") ??
      (req.nextUrl.protocol.replace(":", "") || "https");
    return new URL(path, `${proto}://${host}`);
  };

  // 0a. Subdomínio legado: app.arenatechpi.com.br → redireciona para pdvdepix.app.
  //  O Nginx já faz o redirect na borda; esta linha é defense-in-depth.
  {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (isAppSubdomainHost(host)) {
      const search = req.nextUrl.search;
      return NextResponse.redirect(
        new URL(pathname + search, "https://pdvdepix.app"),
        { status: 301 },
      );
    }
  }

  // 0. Raiz "/" por host:
  //  - host de landing (pdvdepix.app): SEMPRE mostra a landing publica
  //    (logado ou nao) via rewrite, mantendo a URL. O painel fica em /painel.
  //  - host do catálogo (catalogo.arenatechpi): SEMPRE mostra o catálogo novo
  //    via rewrite, mantendo a URL e aposentando o catálogo Laravel antigo.
  if (pathname === "/") {
    const host = req.headers.get("host");
    if (isPublicCatalogHost(host)) {
      return NextResponse.rewrite(new URL("/catalog", req.url));
    }
    if (isLandingHost(host)) {
      return NextResponse.rewrite(new URL("/landing", req.url));
    }
    return NextResponse.redirect(selfUrl("/painel"));
  }

  // 1. Public routes
  if (isPublicRoute(pathname)) {
    if (session && pathname === "/login") {
      if (session.user.mustChangePassword) {
        return NextResponse.redirect(selfUrl("/change-password"));
      }
      const cookieTenant = req.cookies.get("x-active-tenant")?.value;
      const activeTenant = resolveActiveTenant(session, cookieTenant);

      if (activeTenant) {
        const res = NextResponse.redirect(selfUrl("/painel"));
        if (cookieTenant && cookieTenant !== activeTenant.id) {
          res.cookies.delete("x-active-tenant");
        }
        return res;
      }
      if (session.user.isSuperAdmin) {
        const res = NextResponse.redirect(selfUrl("/admin"));
        if (cookieTenant) res.cookies.delete("x-active-tenant");
        return res;
      }
      if (session.availableTenants.length === 0 && !session.user.isSuperAdmin) {
        return NextResponse.redirect(selfUrl("/no-access"));
      }
      const res = NextResponse.redirect(selfUrl("/select-tenant"));
      if (cookieTenant) res.cookies.delete("x-active-tenant");
      return res;
    }
    return NextResponse.next();
  }

  // 2. Not authenticated
  if (!session) {
    const loginUrl = selfUrl("/login");
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 3. Temporary password barrier
  if (session.user.mustChangePassword && !isPasswordChangeRoute(pathname) && pathname !== "/logout") {
    return NextResponse.redirect(selfUrl("/change-password"));
  }

  // 3b. 2FA obrigatório (superadmin/admins): força enrollment quando ligado.
  //  - Só redireciona navegações de página (não /api/*), para não quebrar as
  //    chamadas tRPC de enrollment feitas a partir de /setup-2fa.
  if (
    isTwoFactorEnforced() &&
    !pathname.startsWith("/api/") &&
    !session.user.twoFactorEnabled &&
    sessionRequiresTwoFactor(session) &&
    !isTwoFactorSetupRoute(pathname)
  ) {
    return NextResponse.redirect(selfUrl("/setup-2fa"));
  }

  // 4. No tenants, not super admin
  if (session.availableTenants.length === 0 && !session.user.isSuperAdmin) {
    if (pathname !== "/no-access") {
      return NextResponse.redirect(selfUrl("/no-access"));
    }
    return NextResponse.next();
  }

  // 5. Admin routes
  if (pathname.startsWith("/admin")) {
    if (!session.user.isSuperAdmin) {
      return NextResponse.redirect(selfUrl("/painel"));
    }
    return NextResponse.next();
  }

  // 6. No-tenant routes
  if (isNoTenantRoute(pathname)) {
    return NextResponse.next();
  }

  // 7. Resolve active tenant
  const cookieTenant = req.cookies.get("x-active-tenant")?.value;
  const activeTenant = resolveActiveTenant(session, cookieTenant);

  if (!activeTenant) {
    const res = session.user.isSuperAdmin
      ? NextResponse.redirect(selfUrl("/admin"))
      : NextResponse.redirect(selfUrl("/select-tenant"));
    if (cookieTenant) res.cookies.delete("x-active-tenant");
    return res;
  }

  if (cookieTenant && cookieTenant !== activeTenant.id) {
    if (session.user.isSuperAdmin) {
      const res = NextResponse.redirect(selfUrl("/admin"));
      res.cookies.delete("x-active-tenant");
      return res;
    }
    const res = NextResponse.redirect(selfUrl("/select-tenant"));
    res.cookies.delete("x-active-tenant");
    return res;
  }

  // 7b. Gating por plano: bloqueia rotas de módulos não liberados para o tenant.
  //  - super admin: passa livre (visão total).
  //  - arena-tech e demais: a lista `modules` já vem resolvida na sessão
  //    (arena-tech tem todos). Rota sem módulo (painel, settings) passa.
  if (activeTenant && !session.user.isSuperAdmin) {
    if (!isPathAllowed(pathname, activeTenant.modules)) {
      return NextResponse.redirect(selfUrl("/painel?error=modulo-indisponivel"));
    }
  }

  // 8. Inject tenant header for tRPC context
  const headers = new Headers(req.headers);
  headers.set("x-tenant-id", activeTenant.id);
  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
