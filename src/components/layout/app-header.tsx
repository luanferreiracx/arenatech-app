"use client";

import { Menu, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-context";
import { AppBreadcrumb } from "./breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCommandPalette } from "@/components/command-palette";

interface AppHeaderProps {
  tenantName?: string;
}

export function AppHeader({ tenantName }: AppHeaderProps) {
  const { toggle, isMobile } = useSidebar();
  const { setOpen: openCommandPalette } = useCommandPalette();

  return (
    <header className="h-14 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-40 flex items-center px-4 gap-3">
      {/* Mobile hamburger */}
      {isMobile && (
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label="Abrir menu"
          className="md:hidden"
        >
          <Menu className="w-5 h-5" />
        </Button>
      )}

      {/* Breadcrumb */}
      <div className="flex-1 min-w-0">
        <AppBreadcrumb />
      </div>

      {/* Center: Command Palette Trigger */}
      <button
        onClick={() => openCommandPalette(true)}
        className={cn(
          "hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md border border-border",
          "text-sm text-muted-foreground bg-muted/50 hover:bg-accent hover:text-accent-foreground",
          "transition-colors cursor-pointer"
        )}
        aria-label="Abrir paleta de comandos"
      >
        <span>Buscar ou ir para...</span>
        <kbd className="flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs font-mono">
          ⌘K
        </kbd>
      </button>

      {/* Right: tenant + bell */}
      <div className="flex items-center gap-2">
        {tenantName && (
          <Badge
            variant="outline"
            className="hidden sm:flex text-xs border-primary/30 text-primary bg-primary/5"
          >
            {tenantName}
          </Badge>
        )}

        <Button variant="ghost" size="icon" aria-label="Notificações">
          <Bell className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
