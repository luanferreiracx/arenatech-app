import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { CommandPaletteProvider } from "@/components/command-palette";
import { IdleTimeout } from "@/components/layout/idle-timeout";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { withTenant } from "@/server/db";

/**
 * Logo do tenant ativo (upload em Configurações → Geral, armazenado no MinIO e
 * servido via /api/storage/*). Server-side: sem fetch no cliente. Best-effort —
 * se não houver logo ou a leitura falhar, a marca-placeholder é usada.
 */
async function getTenantLogoUrl(tenantId: string | undefined): Promise<string | null> {
  if (!tenantId) return null;
  try {
    return await withTenant(tenantId, async (tx) => {
      const settings = await tx.tenantSettings.findUnique({
        where: { tenantId },
        select: { logoUrl: true },
      });
      return settings?.logoUrl ?? null;
    });
  } catch {
    return null;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("arena_sidebar_collapsed")?.value === "true";
  const activeTenant = resolveActiveTenant(
    session,
    cookieStore.get("x-active-tenant")?.value,
  );

  const allowedModules = activeTenant?.modules ?? [];
  const tenantLogoUrl = await getTenantLogoUrl(activeTenant?.id);

  return (
    <SidebarProvider
      defaultCollapsed={defaultCollapsed}
      session={{
        user: {
          id: session.user.id,
          name: session.user.name,
          isSuperAdmin: session.user.isSuperAdmin,
        },
        availableTenants: session.availableTenants,
        activeTenantId: session.activeTenantId,
      }}
    >
      <CommandPaletteProvider tenantSlug={activeTenant?.slug} allowedModules={allowedModules}>
        {/* Logout por inatividade (opt-in pelo tenant via Config -> Seguranca). */}
        <IdleTimeout />
        <div className="flex min-h-screen">
          {/* Desktop sidebar */}
          <AppSidebar
            userName={session.user.name ?? "Usuário"}
            multiTenant={session.availableTenants.length > 1}
            tenantName={activeTenant?.name}
            tenantSlug={activeTenant?.slug}
            tenantLogoUrl={tenantLogoUrl}
            allowedModules={allowedModules}
            isSuperAdmin={session.user.isSuperAdmin}
          />

          {/* Mobile sidebar */}
          <MobileSidebar
            userName={session.user.name ?? "Usuário"}
            multiTenant={session.availableTenants.length > 1}
            tenantName={activeTenant?.name}
            tenantSlug={activeTenant?.slug}
            tenantLogoUrl={tenantLogoUrl}
            allowedModules={allowedModules}
            isSuperAdmin={session.user.isSuperAdmin}
          />

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0">
            <AppHeader tenantName={activeTenant?.name}  />
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </CommandPaletteProvider>
    </SidebarProvider>
  );
}
