"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

/** Valor-sentinela do select para entrar no modo "criar nova categoria". */
const NEW_CATEGORY_OPTION = "__new__";

type FinancialCategorySelectProps = {
  /**
   * Categoria selecionada, pelo NOME (a transação armazena a categoria como
   * texto, não FK). Mantém compatibilidade com valores de texto livre já gravados.
   */
  value: string;
  onChange: (categoryName: string) => void;
  /** Tipo da transação — mapeado para o tipo da categoria (RECEITA/DESPESA). */
  transactionType: "RECEIVABLE" | "PAYABLE";
};

/**
 * Select de categoria financeira (entidade FinancialCategory) com opção
 * "+ Nova categoria…" inline, espelhando o padrão de fornecedor/marca. Armazena
 * o NOME da categoria (a transação usa texto, não FK) — assim valores antigos de
 * texto livre continuam válidos e aparecem selecionados mesmo se não estiverem
 * na lista. Cria via financial.createCategory (admin), invalida a lista e já
 * seleciona a nova. Substitui o <Input> de texto livre (evita duplicatas como
 * "Serviços"/"servicos").
 */
export function FinancialCategorySelect({
  value,
  onChange,
  transactionType,
}: FinancialCategorySelectProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const categoryType = transactionType === "RECEIVABLE" ? "RECEITA" : "DESPESA";
  const listInput = { type: categoryType, active: true } as const;
  const categoriesQuery = useQuery(
    trpc.financial.listCategories.queryOptions(listInput),
  );
  const categories = categoriesQuery.data ?? [];

  // Valor de texto livre legado que não está na lista de categorias ativas:
  // mantemos como opção para não perder o dado gravado.
  const hasLegacyValue =
    value.length > 0 && !categories.some((c) => c.name === value);

  const createMutation = useMutation(
    trpc.financial.createCategory.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.financial.listCategories.queryKey(listInput),
        });
        onChange(created.name);
        setCreating(false);
        setNewName("");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const submitNew = () => {
    const trimmed = newName.trim();
    if (trimmed.length < 2) {
      toast.error("Nome da categoria deve ter ao menos 2 caracteres.");
      return;
    }
    createMutation.mutate({ name: trimmed, type: categoryType });
  };

  return (
    <div className="space-y-2">
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={creating ? NEW_CATEGORY_OPTION : value}
        onChange={(e) => {
          if (e.target.value === NEW_CATEGORY_OPTION) {
            setCreating(true);
          } else {
            setCreating(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Sem categoria</option>
        {hasLegacyValue && <option value={value}>{value}</option>}
        {categories.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
        <option value={NEW_CATEGORY_OPTION}>+ Nova categoria…</option>
      </select>
      {creating && (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitNew();
              }
            }}
            placeholder="Nome da nova categoria"
            maxLength={100}
          />
          <button
            type="button"
            onClick={submitNew}
            disabled={createMutation.isPending}
            className="shrink-0 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Criar
          </button>
        </div>
      )}
    </div>
  );
}
