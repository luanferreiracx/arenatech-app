"use client";

import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-context";
import { AppBreadcrumb } from "./breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function AdminHeader() {
  const { toggle, isMobile } = useSidebar();

  return (
    <header
      className={cn(
        "h-14 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-40 flex items-center px-4 gap-3"
      )}
    >
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

      <div className="flex-1 min-w-0">
        <AppBreadcrumb />
      </div>

      <Badge className="bg-warning text-warning-foreground font-semibold text-xs">
        SUPER ADMIN
      </Badge>
    </header>
  );
}
