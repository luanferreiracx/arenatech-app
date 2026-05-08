import Link from "next/link";
import { headers } from "next/headers";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/catalog/services", label: "Serviços" },
  { href: "/catalog/diagnostic-templates", label: "Templates de Diagnóstico" },
  { href: "/catalog/devices", label: "Aparelhos" },
  { href: "/catalog/device-categories", label: "Categorias" },
];

export default async function CatalogLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Catálogo</h1>
        <p className="text-muted-foreground mt-1 text-sm">Serviços, aparelhos e templates de diagnóstico</p>
      </div>

      <div className="flex flex-row gap-1 border-b border-border pb-4">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div>{children}</div>
    </div>
  );
}
