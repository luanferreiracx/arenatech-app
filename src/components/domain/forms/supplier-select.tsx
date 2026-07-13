"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

/** Valor-sentinela do select para entrar no modo "criar novo fornecedor". */
const NEW_SUPPLIER_OPTION = "__new__";

type SupplierSelectProps = {
  /** Fornecedor selecionado (id) ou null. */
  value: string | null;
  onChange: (supplierId: string | null) => void;
};

/**
 * Select de fornecedor (entidade Supplier) com opção "+ Novo fornecedor…" inline,
 * espelhando o padrão de categoria/marca do produto. Cria via stock.createSupplier
 * (find-or-create dedup no servidor), invalida a lista e já seleciona o novo.
 * Substitui o antigo <Input> de texto livre em contas a pagar (auditoria 2026-07-13).
 */
export function SupplierSelect({ value, onChange }: SupplierSelectProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const listInput = { active: true, pageSize: 100 };
  const suppliersQuery = useQuery(trpc.stock.listSuppliers.queryOptions(listInput));
  const suppliers = suppliersQuery.data?.data ?? [];

  const createMutation = useMutation(
    trpc.stock.createSupplier.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.stock.listSuppliers.queryKey(listInput),
        });
        onChange(created.id);
        setCreating(false);
        setNewName("");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const submitNew = () => {
    const trimmed = newName.trim();
    if (trimmed.length < 2) {
      toast.error("Nome do fornecedor deve ter ao menos 2 caracteres.");
      return;
    }
    createMutation.mutate({ name: trimmed, type: "PJ" });
  };

  return (
    <div className="space-y-2">
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={creating ? NEW_SUPPLIER_OPTION : value ?? ""}
        onChange={(e) => {
          if (e.target.value === NEW_SUPPLIER_OPTION) {
            setCreating(true);
          } else {
            setCreating(false);
            onChange(e.target.value || null);
          }
        }}
      >
        <option value="">Sem fornecedor</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value={NEW_SUPPLIER_OPTION}>+ Novo fornecedor…</option>
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
            placeholder="Nome do novo fornecedor"
            maxLength={200}
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
