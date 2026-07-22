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
import {
  isLandingHost,
  isPublicCatalogHost,
  isArenaTechLandingHost,
  isAppSubdomainHost,
  isKnownHost,
  getCatalogSubdomainSlug,
  CANONICAL_APP_HOST,
} from "@/lib/brand-host";
import { isRouteAllowedForTenant } from "@/lib/modules";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";

const PUBLIC_ROUTES = new Set(["/login", "/no-access", "/forgot-password", "/reset-password", "/register"]);

function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_ROUTES.has(pathname) ||
    // Landing publica (marketing) — servida na raiz por host em pdvdepix.app.
    pathname === "/landing" ||
    // Landing institucional Arena Tech (varejo) — servida na raiz por host em
    // arenatechpi.com.br. Publica, sem auth.
    pathname === "/arenatech" ||
    // Documentos legais (Termos, Privacidade, Reembolso, Avisos) — públicos por
    // exigência dos parceiros de pagamento (KYC) e do consumidor. Sem auth.
    pathname === "/legal" ||
    pathname.startsWith("/legal/") ||
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
    pathname.startsWith("/register/") ||
    // Documentação pública da API de parceiros (Swagger UI + spec OpenAPI).
    // O contrato é público; não expõe segredo.
    pathname.startsWith("/docs/partner-api") ||
    pathname === "/api/v1/partner/openapi.yaml" ||
    // Endpoints tRPC públicos do onboarding NO-KYC (ADR 0050) — o procedimento
    // usa publicProcedure, não precisa de sessão. Sem isso o middleware redireciona
    // a chamada fetch para /login e o cliente recebe HTML em vez de JSON.
    pathname.startsWith("/api/trpc/noKyc.")
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

function isPasswordChangeRoute(pathname: string): boolean {
  return pathname === "/change-password" || pathname.startsWith("/api/trpc/auth.changePassword");
}

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Monta uma URL de redirect no HOST REAL da requisicao. `req.url` dentro do
  // wrapper auth() nao reflete o Host header (usa o host interno/NEXTAUTH_URL),
  // o que vazava redirects de pdvdepix.app -> app.arenatechpi. Aqui priorizamos
  // o header Host (que o Nginx encaminha) + o protocolo encaminhado.
  //
  // SEGURANCA (P2-3): so ecoamos o host se ele estiver na ALLOWLIST de hosts
  // conhecidos. `x-forwarded-host` e atacante-controlavel se o Nginx repassar um
  // valor forjado — sem a allowlist, um redirect iria pra `atacante.com/painel`
  // (open-redirect/phishing). Host desconhecido cai pro host canonico.
  const selfUrl = (path: string): URL => {
    const rawHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const host = isKnownHost(rawHost) ? rawHost! : CANONICAL_APP_HOST;
    const proto =
      req.headers.get("x-forwarded-proto") ??
      (req.nextUrl.protocol.replace(":", "") || "https");
    return new URL(path, `${proto}://${host}`);
  };

  // 0a. Subdomínio legado: app.arenatechpi.com.br → redireciona para pdvdepix.app.
  //  EXCEÇÃO: webhooks de provedores externos (ex.: PixPay) chegam por POST e
  //  NÃO seguem redirects — um 301 mata a entrega da notificação. O PixPay tem
  //  a URL legada configurada e não conseguimos alterá-la no painel deles, então
  //  servimos /api/webhooks/* direto no host legado, sem redirecionar. (Bug em
  //  prod: depósitos DePix pararam de confirmar em 06-09 porque o webhook batia
  //  neste 301 e morria.)
  {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (isAppSubdomainHost(host) && !pathname.startsWith("/api/webhooks/")) {
      const search = req.nextUrl.search;
      return NextResponse.redirect(
        new URL(pathname + search, "https://pdvdepix.app"),
        { status: 301 },
      );
    }
  }

  // 0b. Rota legada de rastreamento de OS: o Laravel usava /rastreamento/<link>;
  //  o Next serve em /os/<link>. Links antigos (salvos pelo cliente, ou enviados
  //  antes de corrigir a URL do botao no template do WhatsApp) caem aqui em vez
  //  de 404. Redireciona preservando o publicLink. Rota publica, sem auth.
  {
    const trackingMatch = pathname.match(/^\/rastreamento\/(.+)$/);
    if (trackingMatch) {
      return NextResponse.redirect(selfUrl(`/os/${trackingMatch[1]}`), { status: 301 });
    }
  }

  // 0a. Catálogo multi-tenant por SUBDOMÍNIO: `<slug>.pdvdepix.app` serve o
  //     catálogo do tenant de mesmo slug. O slug vai num header interno
  //     (`x-catalog-tenant-slug`) para o Server Component do catálogo resolver o
  //     tenant certo — sem depender de env var (que era single-tenant). Vale
  //     tanto para a raiz "/" quanto para deep links "/catalog/...".
  {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const catalogSlug = getCatalogSubdomainSlug(host);
    if (catalogSlug && (pathname === "/" || pathname.startsWith("/catalog"))) {
      const headers = new Headers(req.headers);
      headers.set("x-catalog-tenant-slug", catalogSlug);
      const target = pathname === "/" ? selfUrl("/catalog") : selfUrl(pathname + req.nextUrl.search);
      return NextResponse.rewrite(target, { request: { headers } });
    }
  }

  // 0. Raiz "/" por host:
  //  - host de landing (pdvdepix.app): SEMPRE mostra a landing publica
  //    (logado ou nao) via rewrite, mantendo a URL. O painel fica em /painel.
  //  - host do catálogo (catalogo.arenatechpi): SEMPRE mostra o catálogo novo
  //    via rewrite, mantendo a URL e aposentando o catálogo Laravel antigo.
  //  - host da marca Arena Tech (arenatechpi.com.br): SEMPRE mostra a landing
  //    institucional de varejo (loja Apple/acessórios) via rewrite.
  if (pathname === "/") {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (isPublicCatalogHost(host)) {
      return NextResponse.rewrite(selfUrl("/catalog"));
    }
    if (isLandingHost(host)) {
      return NextResponse.rewrite(selfUrl("/landing"));
    }
    if (isArenaTechLandingHost(host)) {
      return NextResponse.rewrite(selfUrl("/arenatech"));
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
  // O gating de MÓDULO é para navegações de PÁGINA. NÃO gatear rotas de API
  // (/api/*, incluindo /api/trpc): um redirect 307 → HTML quebra o cliente JSON
  // (o tRPC recebe "<!DOCTYPE ..." e falha o parse), derrubando TODAS as queries
  // de qualquer usuário não-superadmin. As procedures tRPC já fazem a autorização
  // por tenant (tenantProcedure/RLS); a gating de módulo em API não vale o custo
  // de quebrar o app inteiro. (Incidente: operadores/admins não-superadmin sem
  // acesso a nenhum dado — só o super admin, isento aqui, funcionava.)
  if (
    activeTenant &&
    !session.user.isSuperAdmin &&
    !pathname.startsWith("/api/")
  ) {
    if (!isRouteAllowedForTenant(pathname, activeTenant)) {
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
