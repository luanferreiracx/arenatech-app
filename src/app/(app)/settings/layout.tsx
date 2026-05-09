import Link from "next/link";
import { headers } from "next/headers";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/settings/general", label: "Geral" },
  { href: "/settings/payment-methods", label: "Formas de Pagamento" },
  { href: "/settings/integrations", label: "Integrações" },
  { href: "/settings/users", label: "Usuários" },
  { href: "/settings/security", label: "Segurança" },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-muted-foreground mt-1 text-sm">Gerencie as configurações da sua loja</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar nav */}
        <nav className="flex flex-row gap-1 lg:flex-col lg:w-48 shrink-0">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
