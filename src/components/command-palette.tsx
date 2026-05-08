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
  ShoppingCart,
  UserPlus,
  LayoutDashboard,
  Users,
  ClipboardList,
  Package,
  Settings,
} from "lucide-react";

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

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
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
      <CommandPaletteDialog open={open} setOpen={setOpen} />
    </CommandPaletteContext.Provider>
  );
}

function CommandPaletteDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
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

        <CommandGroup heading="Ações rápidas">
          <CommandItem onSelect={() => runCommand(() => router.push("/service-orders/new"))}>
            <ClipboardPlus className="mr-2 h-4 w-4" />
            Nova Ordem de Serviço
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/pdv"))}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            Nova Venda
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/clientes/novo"))}>
            <UserPlus className="mr-2 h-4 w-4" />
            Novo Cliente
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navegar">
          <CommandItem onSelect={() => runCommand(() => router.push("/"))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/clientes"))}>
            <Users className="mr-2 h-4 w-4" />
            Clientes
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/service-orders"))}>
            <ClipboardList className="mr-2 h-4 w-4" />
            Ordens de Serviço
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/pdv"))}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            PDV
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/estoque"))}>
            <Package className="mr-2 h-4 w-4" />
            Estoque
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/configuracoes"))}>
            <Settings className="mr-2 h-4 w-4" />
            Configurações
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
