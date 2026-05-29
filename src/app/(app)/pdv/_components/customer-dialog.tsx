"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntitySelector } from "@/components/domain/entity-selector";
import { CustomerQuickCreate } from "@/components/domain/customer-quick-create";
import { UserPlus } from "lucide-react";

interface CustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCustomerId?: string;
  onSelected: (id: string, name: string, taxId: string | null) => void;
}

/**
 * Dialog de cliente do PDV — duas abas:
 *  1) Busca: EntitySelector via customer.list (paridade comportamental anterior).
 *  2) Cadastro rapido: cria cliente direto sem sair do PDV. Paridade Laravel
 *     modal-cliente.blade.php que oferece busca + cadastro inline.
 *
 * Apos cadastrar, vincula automaticamente a venda via onSelected.
 */
export function CustomerDialog({
  open,
  onOpenChange,
  currentCustomerId,
  onSelected,
}: CustomerDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"search" | "create">("search");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cliente</DialogTitle>
          <DialogDescription>
            Busque um cliente existente ou cadastre um novo sem sair do PDV.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "search" | "create")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">Buscar</TabsTrigger>
            <TabsTrigger value="create">
              <UserPlus className="mr-2 h-3.5 w-3.5" />
              Novo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="mt-4">
            <EntitySelector<{
              id: string;
              name: string;
              cpf?: string | null;
              cnpj?: string | null;
            }>
              value={currentCustomerId}
              onChange={(id) => {
                // limpa quando deselect — quem usa essa Dialog cuida do unset
                if (!id) return;
              }}
              onSelect={(item) => {
                onSelected(item.id, item.name, item.cpf ?? item.cnpj ?? null);
                onOpenChange(false);
              }}
              searchFn={async (query: string) => {
                const res = await queryClient.fetchQuery(
                  trpc.customer.list.queryOptions({
                    search: query,
                    page: 0,
                    pageSize: 10,
                  }),
                );
                return res.data as Array<{
                  id: string;
                  name: string;
                  cpf?: string | null;
                  cnpj?: string | null;
                }>;
              }}
              getOptionLabel={(item) => {
                const doc = item.cpf ?? item.cnpj;
                return doc ? `${item.name} — ${doc}` : item.name;
              }}
              getOptionValue={(item) => item.id}
              placeholder="Buscar por nome, CPF/CNPJ ou telefone..."
              emptyMessage="Nenhum cliente encontrado. Clique em 'Novo' para cadastrar."
            />
          </TabsContent>

          <TabsContent value="create" className="mt-4">
            <CustomerQuickCreate
              onCreated={(c) => {
                onSelected(c.id, c.name, c.cpf ?? c.cnpj ?? null);
                onOpenChange(false);
                setTab("search");
              }}
              onCancel={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
