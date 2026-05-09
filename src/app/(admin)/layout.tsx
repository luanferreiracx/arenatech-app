import { createMetadata } from "@/lib/metadata";
import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { AdminHeader } from "@/components/layout/admin-header";

export const metadata = createMetadata("Admin");

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/no-access");

  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("arena_sidebar_collapsed")?.value === "true";

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
      <div className="flex min-h-screen">
        <AdminSidebar userName={session.user.name} />

        <div className="flex-1 flex flex-col min-w-0">
          <AdminHeader />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
