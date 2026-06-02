"use client";

import { useEffect, useState, createContext, useContext, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  ClipboardPlus,
  UserPlus,
  ShoppingCart,
} from "lucide-react";
import { appNavGroups, isNavItemVisible } from "@/components/layout/nav-items";

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be inside CommandPaletteProvider");
  return ctx;
}

export function CommandPaletteProvider({
  children,
  tenantSlug,
  allowedModules,
}: {
  children: React.ReactNode;
  tenantSlug?: string;
  allowedModules?: string[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen }}>
      {children}
      <CommandPaletteDialog open={open} setOpen={setOpen} tenantSlug={tenantSlug} allowedModules={allowedModules} />
    </CommandPaletteContext.Provider>
  );
}

function CommandPaletteDialog({
  open,
  setOpen,
  tenantSlug,
  allowedModules,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  tenantSlug?: string;
  allowedModules?: string[];
}) {
  const router = useRouter();

  const runCommand = useCallback(
    (fn: () => void) => {
      setOpen(false);
      fn();
    },
    [setOpen]
  );

  const has = (mod: string) => (allowedModules ?? []).includes(mod);
  const quickActions = [
    { mod: "service-orders", icon: ClipboardPlus, label: "Nova Ordem de Servico", href: "/service-orders/new" },
    { mod: "customers", icon: UserPlus, label: "Novo Cliente", href: "/customers/new" },
    { mod: "pdv", icon: ShoppingCart, label: "Nova Venda", href: "/pdv" },
  ].filter((a) => has(a.mod));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar ou ir para..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        {quickActions.length > 0 && (
          <>
            <CommandGroup heading="Acoes rapidas">
              {quickActions.map((a) => {
                const Icon = a.icon;
                return (
                  <CommandItem key={a.href} onSelect={() => runCommand(() => router.push(a.href))}>
                    <Icon className="mr-2 h-4 w-4" />
                    {a.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {appNavGroups.map((group, gi) => {
          const visibleItems = group.items.filter((it) =>
            isNavItemVisible(it, { tenantSlug, allowedModules }),
          );
          if (visibleItems.length === 0) return null;
          return (
            <CommandGroup key={gi} heading={group.title ?? "Navegar"}>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    onSelect={() => runCommand(() => router.push(item.href))}
                    keywords={[item.label, item.href]}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
