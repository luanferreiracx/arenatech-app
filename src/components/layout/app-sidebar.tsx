"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, ArrowLeftRight, LogOut, User } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/branding/logo";
import { useSidebar } from "./sidebar-context";
import { appNavItems } from "./nav-items";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AppSidebarProps {
  userName: string;
  multiTenant: boolean;
  tenantName?: string;
}

export function AppSidebar({ userName, multiTenant, tenantName }: AppSidebarProps) {
  const { isCollapsed, toggle } = useSidebar();
  const pathname = usePathname();

  const initials = userName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "hidden md:flex flex-col sticky top-0 h-screen bg-sidebar border-r border-sidebar-border transition-[width] duration-200 ease-in-out shrink-0 z-30",
          isCollapsed ? "w-16" : "w-56"
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center h-14 border-b border-sidebar-border px-3 shrink-0",
            isCollapsed ? "justify-center" : "justify-between"
          )}
        >
          {!isCollapsed && <Logo size="sm" variant="full" />}
          {isCollapsed && <Logo size="sm" variant="icon" />}
          <button
            onClick={toggle}
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
              isCollapsed && "ml-0"
            )}
            aria-label={isCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {appNavItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-normal transition-colors",
                  isCollapsed ? "justify-center px-0 w-full" : "",
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
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );

            if (isCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }

            return <div key={item.href}>{linkContent}</div>;
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-2 shrink-0 space-y-1">
          {multiTenant && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/select-tenant"
                  className={cn(
                    "flex items-center gap-3 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
                    isCollapsed ? "justify-center" : ""
                  )}
                >
                  <ArrowLeftRight className="w-4 h-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">Trocar de loja</span>}
                </Link>
              </TooltipTrigger>
              {isCollapsed && <TooltipContent side="right">Trocar de loja</TooltipContent>}
            </Tooltip>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-3 w-full rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent transition-colors",
                  isCollapsed ? "justify-center" : ""
                )}
              >
                <Avatar className="w-7 h-7 shrink-0">
                  <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-sm font-medium text-sidebar-foreground truncate max-w-[120px]">
                      {userName}
                    </span>
                    {tenantName && (
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {tenantName}
                      </span>
                    )}
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/perfil" className="flex items-center gap-2">
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
      </aside>
    </TooltipProvider>
  );
}
