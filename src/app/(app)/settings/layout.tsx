"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Geral", href: "/settings/general" },
  { label: "Assistência", href: "/settings/assistance" },
  { label: "Fiscal", href: "/settings/fiscal" },
  { label: "Formas de Pagamento", href: "/settings/payment-methods" },
  { label: "Meios de Recebimento", href: "/settings/card-acquirers" },
  { label: "Parcelamento", href: "/settings/installments" },
  { label: "Recebimento", href: "/settings/receiving" },
  { label: "Integracoes", href: "/settings/integrations" },
  { label: "Equipe", href: "/settings/users" },
  { label: "Entregadores", href: "/settings/delivery-persons" },
  { label: "Assinatura", href: "/settings/subscription" },
  { label: "Logs", href: "/settings/logs" },
  { label: "Seguranca", href: "/settings/security" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <nav className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
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
