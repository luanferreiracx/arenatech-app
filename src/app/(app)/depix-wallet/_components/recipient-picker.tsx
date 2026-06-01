"use client";

import { useState } from "react";
import { ChevronDown, Clock, Search, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCpf, formatCnpj } from "@/lib/utils";
import type { PixKeyType } from "@/lib/utils/pix-detect";

interface Recipient {
  pixKey: string;
  pixKeyType: string;
  recipientName: string | null;
  recipientTaxId: string | null;
  lastUsedAt: Date;
}

interface RecipientPickerProps {
  /** Permite passar children customizado pra usar como trigger (default: dropdown botao). */
  triggerLabel?: string;
  onPick: (r: Recipient) => void;
  className?: string;
}

function fmtKey(type: string, key: string): string {
  if (type === "CPF") return formatCpf(key) || key;
  if (type === "CNPJ") return formatCnpj(key) || key;
  if (type === "PHONE") {
    const d = key.replace(/\D/g, "");
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return key;
}

const TYPE_LABELS: Record<string, string> = {
  CPF: "CPF",
  CNPJ: "CNPJ",
  EMAIL: "E-mail",
  PHONE: "Telefone",
  RANDOM: "Chave aleatoria",
};

function relTime(d: Date): string {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min atras`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atras`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d atras`;
  return new Date(d).toLocaleDateString("pt-BR");
}

/**
 * Botao + popover com autocomplete de saques recentes do tenant.
 * Clicar num recipient chama onPick(r) — o consumidor preenche os
 * campos do form (pixKeyType, pixKey, recipientName, recipientTaxId).
 */
export function RecipientPicker({
  triggerLabel = "Usar saque recente",
  onPick,
  className,
}: RecipientPickerProps) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const recentsQuery = useQuery({
    ...trpc.depixTransaction.searchRecipients.queryOptions({ query }),
    enabled: open,
  });

  const items = (recentsQuery.data ?? []) as Recipient[];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors",
            className,
          )}
        >
          <Clock className="h-3.5 w-3.5" />
          {triggerLabel}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(28rem,calc(100vw-2rem))] p-0 overflow-hidden"
      >
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por chave, CPF ou nome..."
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {recentsQuery.isLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Carregando...
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-muted-foreground">
                {query
                  ? "Nenhum destinatario encontrado."
                  : "Nenhum saque recente ainda."}
              </p>
            </div>
          ) : (
            <ul className="py-1">
              {items.map((r) => (
                <li key={`${r.pixKeyType}:${r.pixKey}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(r);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors flex items-start gap-3"
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0 mt-0.5">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium truncate">
                          {r.recipientName || "(sem nome)"}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {relTime(r.lastUsedAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        <span className="uppercase tracking-wider mr-1.5">
                          {TYPE_LABELS[r.pixKeyType] ?? r.pixKeyType}
                        </span>
                        <span className="font-mono">
                          {fmtKey(r.pixKeyType, r.pixKey)}
                        </span>
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
