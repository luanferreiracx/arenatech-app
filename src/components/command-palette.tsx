"use client";

import { useEffect, useState, createContext, useContext, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
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
  User,
  ClipboardList,
  Package,
} from "lucide-react";
import { appNavGroups, isNavItemVisible } from "@/components/layout/nav-items";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

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
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 250);

  const runCommand = useCallback(
    (fn: () => void) => {
      setOpen(false);
      setSearch("");
      fn();
    },
    [setOpen]
  );

  const has = (mod: string) => (allowedModules ?? []).includes(mod);

  // Tipos a buscar conforme os módulos do tenant (não busca o que a UI não mostra).
  const types: ("customers" | "serviceOrders" | "products")[] = [];
  if (has("customers")) types.push("customers");
  if (has("service-orders")) types.push("serviceOrders");
  if (has("pdv") || has("stock")) types.push("products");

  const searchQuery = useQuery(
    trpc.search.global.queryOptions(
      { term: debounced, types: types.length ? types : undefined },
      { enabled: open && debounced.length >= 2 && types.length > 0 },
    ),
  );
  const entities = searchQuery.data;
  const hasEntityResults =
    !!entities &&
    (entities.customers.length > 0 ||
      entities.serviceOrders.length > 0 ||
      entities.products.length > 0);

  const quickActions = [
    { mod: "service-orders", icon: ClipboardPlus, label: "Nova Ordem de Servico", href: "/service-orders/new" },
    { mod: "customers", icon: UserPlus, label: "Novo Cliente", href: "/customers/new" },
    { mod: "pdv", icon: ShoppingCart, label: "Nova Venda", href: "/pdv" },
  ].filter((a) => has(a.mod));

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <CommandInput
        placeholder="Buscar cliente, OS, produto ou ir para..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          {debounced.length >= 2 && searchQuery.isFetching
            ? "Buscando..."
            : "Nenhum resultado encontrado."}
        </CommandEmpty>

        {/* Resultados de entidades (deep-link direto ao detalhe). O `value` embute
            o termo para o cmdk sempre manter estes itens (a busca é do servidor). */}
        {hasEntityResults && (
          <>
            {entities!.customers.length > 0 && (
              <CommandGroup heading="Clientes">
                {entities!.customers.map((c) => (
                  <CommandItem
                    key={`cust-${c.id}`}
                    value={`cliente ${c.id} ${search}`}
                    onSelect={() => runCommand(() => router.push(`/customers/${c.id}`))}
                  >
                    <User className="mr-2 h-4 w-4" />
                    <span className="truncate">{c.name}</span>
                    {c.subtitle && (
                      <span className="ml-auto text-xs text-muted-foreground">{c.subtitle}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {entities!.serviceOrders.length > 0 && (
              <CommandGroup heading="Ordens de Servico">
                {entities!.serviceOrders.map((o) => (
                  <CommandItem
                    key={`os-${o.id}`}
                    value={`os ${o.id} ${search}`}
                    onSelect={() => runCommand(() => router.push(`/service-orders/${o.id}`))}
                  >
                    <ClipboardList className="mr-2 h-4 w-4" />
                    <span className="truncate">
                      OS {o.number}
                      {o.customerName ? ` — ${o.customerName}` : ""}
                    </span>
                    {o.device && (
                      <span className="ml-auto text-xs text-muted-foreground truncate">{o.device}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {entities!.products.length > 0 && (
              <CommandGroup heading="Produtos">
                {entities!.products.map((p) => (
                  <CommandItem
                    key={`prod-${p.id}`}
                    value={`produto ${p.id} ${search}`}
                    onSelect={() => runCommand(() => router.push(`/stock/${p.id}`))}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    <span className="truncate">{p.name}</span>
                    {p.sku && (
                      <span className="ml-auto text-xs text-muted-foreground">{p.sku}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
          </>
        )}

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
