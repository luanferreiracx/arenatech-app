import Link from "next/link";
import { headers } from "next/headers";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Entregadores", href: "/operation/delivery-persons" },
  { label: "Laboratórios", href: "/operation/labs" },
  { label: "Envios Lab", href: "/operation/lab-orders" },
  { label: "Prestadores", href: "/operation/providers" },
];

export default async function OperationLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  return (
    <div className="space-y-4">
      <nav className="flex border-b border-border">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
