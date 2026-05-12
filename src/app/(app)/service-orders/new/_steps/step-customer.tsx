"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { EntitySelector } from "@/components/domain/entity-selector";
import type { CreateServiceOrderInput } from "@/lib/validators/service-order";

interface Props {
  data: Partial<CreateServiceOrderInput>;
  onChange: (patch: Partial<CreateServiceOrderInput>) => void;
}

interface CustomerOption {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
}

export function StepCustomer({ data, onChange }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const searchCustomers = useCallback(
    async (query: string): Promise<CustomerOption[]> => {
      const result = await queryClient.fetchQuery(
        trpc.customer.list.queryOptions({
          search: query,
          pageSize: 10,
        }),
      );
      return result.data.map((c: { id: string; name: string; cpf: string | null; phone: string | null }) => ({
        id: c.id,
        name: c.name,
        cpf: c.cpf,
        phone: c.phone,
      }));
    },
    [trpc.customer.list, queryClient]
  );

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Selecione o Cliente</h3>
      <div className="max-w-md">
        <EntitySelector<CustomerOption>
          value={data.customerId}
          onChange={(val) => onChange({ customerId: val })}
          searchFn={searchCustomers}
          getOptionLabel={(c) => {
            const parts = [c.name];
            if (c.cpf) parts.push(`CPF: ${c.cpf}`);
            if (c.phone) parts.push(c.phone);
            return parts.join(" — ");
          }}
          getOptionValue={(c) => c.id}
          placeholder="Buscar por nome, CPF ou telefone..."
          emptyMessage="Nenhum cliente encontrado."
        />
        <p className="text-sm text-muted-foreground mt-2">
          Cliente nao encontrado?{" "}
          <a href="/customers/new" target="_blank" className="text-primary hover:underline">
            Cadastre aqui
          </a>
        </p>
      </div>
    </div>
  );
}
