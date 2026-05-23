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
import { appNavGroups } from "@/components/layout/nav-items";

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
}: {
  children: React.ReactNode;
  tenantSlug?: string;
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
      <CommandPaletteDialog open={open} setOpen={setOpen} tenantSlug={tenantSlug} />
    </CommandPaletteContext.Provider>
  );
}

function CommandPaletteDialog({
  open,
  setOpen,
  tenantSlug,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  tenantSlug?: string;
}) {
  const router = useRouter();

  const runCommand = useCallback(
    (fn: () => void) => {
      setOpen(false);
      fn();
    },
    [setOpen]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar ou ir para..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        <CommandGroup heading="Acoes rapidas">
          <CommandItem onSelect={() => runCommand(() => router.push("/service-orders/new"))}>
            <ClipboardPlus className="mr-2 h-4 w-4" />
            Nova Ordem de Servico
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/customers/new"))}>
            <UserPlus className="mr-2 h-4 w-4" />
            Novo Cliente
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/pdv"))}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            Nova Venda
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {appNavGroups.map((group, gi) => {
          const visibleItems = group.items.filter(
            (it) => !it.requiresTenantSlug || it.requiresTenantSlug === tenantSlug,
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
