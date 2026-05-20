import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { CommandPaletteProvider } from "@/components/command-palette";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("arena_sidebar_collapsed")?.value === "true";
  const activeTenantId =
    cookieStore.get("x-active-tenant")?.value ?? session.activeTenantId;
  const activeTenant = session.availableTenants.find((t) => t.id === activeTenantId);

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
      <CommandPaletteProvider tenantSlug={activeTenant?.slug}>
        <div className="flex min-h-screen">
          {/* Desktop sidebar */}
          <AppSidebar
            userName={session.user.name ?? "Usuário"}
            multiTenant={session.availableTenants.length > 1}
            tenantName={activeTenant?.name}
            tenantSlug={activeTenant?.slug}
            isSuperAdmin={session.user.isSuperAdmin}
          />

          {/* Mobile sidebar */}
          <MobileSidebar
            userName={session.user.name ?? "Usuário"}
            multiTenant={session.availableTenants.length > 1}
            tenantName={activeTenant?.name}
            tenantSlug={activeTenant?.slug}
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
