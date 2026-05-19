"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { EntitySelector } from "@/components/domain/entity-selector";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CustomerForm } from "@/app/(app)/customers/_components/customer-form";
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [justCreatedLabel, setJustCreatedLabel] = useState<string | null>(null);

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
    [trpc.customer.list, queryClient],
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
          initialLabel={justCreatedLabel}
        />
        <p className="text-sm text-muted-foreground mt-2">
          Cliente nao encontrado?{" "}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            <UserPlus className="h-3 w-3" />
            Cadastre aqui
          </button>
        </p>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-6">
          <SheetHeader>
            <SheetTitle>Cadastrar novo cliente</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <CustomerForm
              mode="create"
              onSuccess={(customer) => {
                onChange({ customerId: customer.id });
                setJustCreatedLabel(customer.name);
                setSheetOpen(false);
              }}
              onCancel={() => setSheetOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
