"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2, Search } from "lucide-react";

type NcmResult = { code: string; description: string };

type NcmInputProps = {
  value: string | null | undefined;
  onChange: (code: string | null) => void;
  /** Texto base (ex: nome do produto) para sugerir NCM quando o campo esta vazio. */
  suggestText?: string;
  placeholder?: string;
  className?: string;
};

/**
 * Campo de NCM com busca: o operador pode digitar o codigo (8 digitos) direto OU
 * buscar por nome ("celular", "fone") e escolher da lista. Quando vazio, sugere
 * NCMs com base no nome do produto. Liga as procedures searchNcm/suggestNcm que
 * existiam no backend mas nao tinham UI.
 */
export function NcmInput({ value, onChange, suggestText, placeholder, className }: NcmInputProps) {
  const trpc = useTRPC();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const digits = useMemo(() => (value ?? "").replace(/\D/g, "").slice(0, 8), [value]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 350);
    return () => clearTimeout(t);
  }, [term]);

  // Busca por termo (>=3 chars). Senao, sugere pelo nome do produto.
  const searchQuery = useQuery({
    ...trpc.stock.searchNcm.queryOptions({ term: debounced }),
    enabled: open && debounced.length >= 3,
    staleTime: 60_000,
  });
  const suggestQuery = useQuery({
    ...trpc.stock.suggestNcm.queryOptions({ text: suggestText ?? "" }),
    enabled: open && debounced.length < 3 && !!suggestText && suggestText.length >= 2,
    staleTime: 60_000,
  });

  // searchNcm retorna { code, description }; suggestNcm retorna
  // { ncm, descricao, matched }. Normaliza os dois para { code, description }.
  const results: NcmResult[] = useMemo(() => {
    if (debounced.length >= 3) {
      return (searchQuery.data as NcmResult[] | undefined) ?? [];
    }
    const sug = (suggestQuery.data as Array<{ ncm: string; descricao: string }> | undefined) ?? [];
    return sug.map((s) => ({ code: s.ncm, description: s.descricao }));
  }, [debounced, searchQuery.data, suggestQuery.data]);
  const isFetching = searchQuery.isFetching || suggestQuery.isFetching;

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const select = (code: string) => {
    onChange(code || null);
    setTerm("");
    setDebounced("");
    setOpen(false);
  };

  const invalidLength = digits.length > 0 && digits.length !== 8;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={open ? term : digits}
          onChange={(e) => {
            const raw = e.target.value;
            // Se digitou so numeros, trata como codigo NCM; senao, e busca por nome.
            const onlyDigits = raw.replace(/\D/g, "");
            if (raw === onlyDigits) {
              onChange(onlyDigits.slice(0, 8) || null);
              setTerm("");
            } else {
              setTerm(raw);
            }
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "Codigo (8 digitos) ou busque por nome"}
          className={cn("pl-9", invalidLength && "border-destructive", className)}
          inputMode="text"
        />
        {isFetching && open && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {invalidLength && !open && (
        <p className="mt-1 text-xs text-destructive">NCM deve ter 8 digitos.</p>
      )}

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {results.map((r) => (
            <button
              key={r.code}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50"
              onMouseDown={(e) => {
                e.preventDefault();
                select(r.code);
              }}
            >
              <span className="truncate">{r.description}</span>
              <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
