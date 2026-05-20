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
  LayoutDashboard,
  Users,
  ClipboardList,
  Package,
  DollarSign,
  Settings,
  ShoppingCart,
  History,
  FileText,
  Percent,
  Smartphone,
  Truck,
  MessageSquare,
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

        <CommandGroup heading="Navegar">
          <CommandItem onSelect={() => runCommand(() => router.push("/"))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/customers"))}>
            <Users className="mr-2 h-4 w-4" />
            Clientes
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/service-orders"))}>
            <ClipboardList className="mr-2 h-4 w-4" />
            Ordens de Servico
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/pdv"))}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            PDV
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/pdv/history"))}>
            <History className="mr-2 h-4 w-4" />
            Historico de Vendas
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/stock"))}>
            <Package className="mr-2 h-4 w-4" />
            Estoque
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/financial"))}>
            <DollarSign className="mr-2 h-4 w-4" />
            Financeiro
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/fiscal"))}>
            <FileText className="mr-2 h-4 w-4" />
            Fiscal
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/commissions"))}>
            <Percent className="mr-2 h-4 w-4" />
            Comissoes
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/imei"))}>
            <Smartphone className="mr-2 h-4 w-4" />
            Consulta IMEI
          </CommandItem>
          {tenantSlug === "arena-tech" && (
            <CommandItem onSelect={() => runCommand(() => router.push("/iphone-hunter"))}>
              <Smartphone className="mr-2 h-4 w-4" />
              Buscar iPhones nos Grupos
            </CommandItem>
          )}
          <CommandItem onSelect={() => runCommand(() => router.push("/operation"))}>
            <Truck className="mr-2 h-4 w-4" />
            Operacao
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/communication"))}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Comunicacao
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            Configuracoes
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
