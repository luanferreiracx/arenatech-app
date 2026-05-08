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

const PUBLIC_ROUTES = new Set(["/login", "/no-access", "/forgot-password"]);

function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_ROUTES.has(pathname) ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/health")
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

  // 1. Public routes
  if (isPublicRoute(pathname)) {
    if (session && pathname === "/login") {
      const cookieTenant = req.cookies.get("x-active-tenant")?.value;
      const activeTenantId = cookieTenant ?? session.activeTenantId;

      if (session.user.isSuperAdmin && !activeTenantId) {
        return NextResponse.redirect(new URL("/admin", req.url));
      }
      if (activeTenantId) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      if (session.availableTenants.length === 0 && !session.user.isSuperAdmin) {
        return NextResponse.redirect(new URL("/no-access", req.url));
      }
      return NextResponse.redirect(new URL("/select-tenant", req.url));
    }
    return NextResponse.next();
  }

  // 2. Not authenticated
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 3. No tenants, not super admin
  if (session.availableTenants.length === 0 && !session.user.isSuperAdmin) {
    if (pathname !== "/no-access") {
      return NextResponse.redirect(new URL("/no-access", req.url));
    }
    return NextResponse.next();
  }

  // 4. Admin routes
  if (pathname.startsWith("/admin")) {
    if (!session.user.isSuperAdmin) {
      return NextResponse.redirect(new URL("/", req.url));
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
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.redirect(new URL("/select-tenant", req.url));
  }

  // Validate tenant access (cookie could be stale or forged)
  const hasTenant = session.availableTenants.some((t) => t.id === activeTenantId);
  if (!hasTenant && !session.user.isSuperAdmin) {
    const res = NextResponse.redirect(new URL("/select-tenant", req.url));
    res.cookies.delete("x-active-tenant");
    return res;
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
