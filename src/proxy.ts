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
import { isLandingHost } from "@/lib/brand-host";
import { isPathAllowed } from "@/lib/modules";

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
    pathname.startsWith("/admin")
  );
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

  // 0. Raiz "/" por host:
  //  - host de landing (pdvdepix.app): SEMPRE mostra a landing publica
  //    (logado ou nao) via rewrite, mantendo a URL. O painel fica em /painel.
  //  - host de app (app.arenatechpi): "/" -> /painel (o dashboard saiu da raiz).
  if (pathname === "/") {
    if (isLandingHost(req.headers.get("host"))) {
      return NextResponse.rewrite(new URL("/landing", req.url));
    }
    return NextResponse.redirect(selfUrl("/painel"));
  }

  // 1. Public routes
  if (isPublicRoute(pathname)) {
    if (session && pathname === "/login") {
      const cookieTenant = req.cookies.get("x-active-tenant")?.value;
      const activeTenantId = cookieTenant ?? session.activeTenantId;

      if (session.user.isSuperAdmin && !activeTenantId) {
        return NextResponse.redirect(selfUrl("/admin"));
      }
      if (activeTenantId) {
        return NextResponse.redirect(selfUrl("/painel"));
      }
      if (session.availableTenants.length === 0 && !session.user.isSuperAdmin) {
        return NextResponse.redirect(selfUrl("/no-access"));
      }
      return NextResponse.redirect(selfUrl("/select-tenant"));
    }
    return NextResponse.next();
  }

  // 2. Not authenticated
  if (!session) {
    const loginUrl = selfUrl("/login");
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 3. No tenants, not super admin
  if (session.availableTenants.length === 0 && !session.user.isSuperAdmin) {
    if (pathname !== "/no-access") {
      return NextResponse.redirect(selfUrl("/no-access"));
    }
    return NextResponse.next();
  }

  // 4. Admin routes
  if (pathname.startsWith("/admin")) {
    if (!session.user.isSuperAdmin) {
      return NextResponse.redirect(selfUrl("/painel"));
    }
    return NextResponse.next();
  }

  // 5. No-tenant routes
  if (isNoTenantRoute(pathname)) {
    return NextResponse.next();
  }

  // 6. Resolve active tenant
  const cookieTenant = req.cookies.get("x-active-tenant")?.value;
  const activeTenantId = cookieTenant ?? session.activeTenantId;

  if (!activeTenantId) {
    if (session.user.isSuperAdmin) {
      return NextResponse.redirect(selfUrl("/admin"));
    }
    return NextResponse.redirect(selfUrl("/select-tenant"));
  }

  // Validate tenant access (cookie could be stale or forged)
  const activeTenant = session.availableTenants.find((t) => t.id === activeTenantId);
  if (!activeTenant && !session.user.isSuperAdmin) {
    const res = NextResponse.redirect(selfUrl("/select-tenant"));
    res.cookies.delete("x-active-tenant");
    return res;
  }

  // 6b. Gating por plano: bloqueia rotas de módulos não liberados para o tenant.
  //  - super admin: passa livre (visão total).
  //  - arena-tech e demais: a lista `modules` já vem resolvida na sessão
  //    (arena-tech tem todos). Rota sem módulo (painel, settings) passa.
  if (activeTenant && !session.user.isSuperAdmin) {
    if (!isPathAllowed(pathname, activeTenant.modules)) {
      return NextResponse.redirect(selfUrl("/painel?error=modulo-indisponivel"));
    }
  }

  // 7. Inject tenant header for tRPC context
  const headers = new Headers(req.headers);
  headers.set("x-tenant-id", activeTenantId);
  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
