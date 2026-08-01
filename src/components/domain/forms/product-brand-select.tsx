"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

/** Valor-sentinela do select para entrar no modo "criar nova marca". */
const NEW_BRAND_OPTION = "__new__";

type ProductBrandSelectProps = {
  /** Marca selecionada (FK ProductBrand.id) ou null para "sem marca". */
  value: string | null;
  onChange: (brandId: string | null) => void;
};

/**
 * Select de marca do produto com criação inline — a marca nasce NA HORA
 * (stock.createBrand), já aparece em Estoque › Marcas e volta selecionada.
 *
 * Antes o formulário carregava um segundo campo (`newBrandName`) que só virava
 * marca quando o produto era salvo: se o cadastro falhasse na validação, a marca
 * digitada evaporava, e não havia tela nenhuma para gerenciá-las. O servidor
 * ainda aceita `newBrandName` (import CSV e API de parceiros usam), mas o
 * formulário não precisa mais dele.
 *
 * A dedup é do servidor: "Asus", "ASUS" e "Ásus" são a mesma marca (comparação
 * por nome normalizado), então tentar recriar devolve CONFLICT com o nome que
 * já existe.
 */
export function ProductBrandSelect({ value, onChange }: ProductBrandSelectProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const brandsQuery = useQuery(trpc.stock.listBrands.queryOptions({}));
  const brands = brandsQuery.data?.data ?? [];

  const createMutation = useMutation(
    trpc.stock.createBrand.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({ queryKey: trpc.stock.listBrands.queryKey() });
        onChange(created.id);
        setCreating(false);
        setNewName("");
        toast.success(`Marca "${created.name}" criada.`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const submitNew = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error("Informe o nome da marca.");
      return;
    }
    createMutation.mutate({ name: trimmed });
  };

  return (
    <div className="space-y-2">
      <select
        aria-label="Marca"
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={creating ? NEW_BRAND_OPTION : value ?? ""}
        onChange={(event) => {
          if (event.target.value === NEW_BRAND_OPTION) {
            setCreating(true);
            return;
          }
          setCreating(false);
          onChange(event.target.value || null);
        }}
      >
        <option value="">Sem marca</option>
        {brands.map((brand) => (
          <option key={brand.id} value={brand.id}>
            {brand.name}
          </option>
        ))}
        <option value={NEW_BRAND_OPTION}>+ Nova marca…</option>
      </select>

      {creating && (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitNew();
              }
              if (event.key === "Escape") setCreating(false);
            }}
            placeholder="Nome da nova marca"
            maxLength={100}
          />
          <Button type="button" onClick={submitNew} disabled={createMutation.isPending}>
            Criar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
