"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SettingsTab {
  label: string;
  href: string;
  /** Aba visível só pro superadmin (ex.: API de Parceiros). */
  superAdminOnly?: boolean;
}

/** Barra de abas de Configurações — recebe só as abas acessíveis ao tenant. */
export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const pathname = usePathname();
  return (
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
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
