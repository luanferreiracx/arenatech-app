"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, LogOut, User } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/branding/logo";
import { useSidebar } from "./sidebar-context";
import { appNavItems } from "./nav-items";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MobileSidebarProps {
  userName: string;
  multiTenant: boolean;
  tenantName?: string;
}

export function MobileSidebar({ userName, multiTenant, tenantName }: MobileSidebarProps) {
  const { isCollapsed, toggle } = useSidebar();
  const pathname = usePathname();

  const initials = userName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  // On mobile, isCollapsed === sidebar hidden
  const open = !isCollapsed;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) toggle(); }}>
      <SheetContent side="left" className="w-64 p-0 bg-sidebar border-r border-sidebar-border">
        <SheetHeader className="h-14 px-4 border-b border-sidebar-border flex flex-row items-center justify-between">
          <SheetTitle asChild>
            <Logo size="sm" variant="full" />
          </SheetTitle>
        </SheetHeader>

        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {appNavItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => toggle()}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-normal transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium border-l-2 border-primary pl-[6px]"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border-l-2 border-transparent pl-[6px]"
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-2 space-y-1">
          {multiTenant && (
            <Link
              href="/select-tenant"
              className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              onClick={() => toggle()}
            >
              <ArrowLeftRight className="w-4 h-4 shrink-0" />
              <span className="truncate">Trocar de loja</span>
            </Link>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent transition-colors">
                <Avatar className="w-7 h-7 shrink-0">
                  <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-sm font-medium text-sidebar-foreground truncate max-w-[140px]">
                    {userName}
                  </span>
                  {tenantName && (
                    <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                      {tenantName}
                    </span>
                  )}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/settings" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SheetContent>
    </Sheet>
  );
}
