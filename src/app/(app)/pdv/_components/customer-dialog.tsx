"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntitySelector } from "@/components/domain/entity-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "@/lib/toast";

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

  // Form de cadastro rapido
  const [type, setType] = useState<"PF" | "PJ">("PF");
  const [name, setName] = useState("");
  const [doc, setDoc] = useState(""); // CPF ou CNPJ conforme type
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const createMutation = useMutation(
    trpc.customer.create.mutationOptions({
      onSuccess: (created) => {
        toast.success(`Cliente ${created.name} cadastrado.`);
        onSelected(
          created.id,
          created.name,
          (created.cpf ?? created.cnpj ?? null) as string | null,
        );
        // reseta form e fecha
        setName("");
        setDoc("");
        setPhone("");
        setEmail("");
        onOpenChange(false);
        setTab("search");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function handleCreate() {
    if (name.trim().length < 2) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      toast.error("Telefone deve ter ao menos 10 digitos.");
      return;
    }
    const docDigits = doc.replace(/\D/g, "");
    if (type === "PF" && docDigits.length !== 11) {
      toast.error("CPF deve ter 11 digitos.");
      return;
    }
    if (type === "PJ" && docDigits.length !== 14) {
      toast.error("CNPJ deve ter 14 digitos.");
      return;
    }
    createMutation.mutate({
      type,
      name: name.trim(),
      phone: phone.replace(/\D/g, ""),
      ...(type === "PF" ? { cpf: docDigits } : { cnpj: docDigits }),
      ...(email.trim() ? { email: email.trim() } : {}),
    });
  }

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

          <TabsContent value="create" className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={type === "PF" ? "default" : "outline"}
                onClick={() => setType("PF")}
                size="sm"
              >
                Pessoa Fisica
              </Button>
              <Button
                type="button"
                variant={type === "PJ" ? "default" : "outline"}
                onClick={() => setType("PJ")}
                size="sm"
              >
                Pessoa Juridica
              </Button>
            </div>

            <div className="space-y-1">
              <Label htmlFor="customer-name">
                {type === "PF" ? "Nome completo" : "Razao social"} *
              </Label>
              <Input
                id="customer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === "PF" ? "Ex: Maria da Silva" : "Ex: Loja XYZ Ltda"}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="customer-doc">{type === "PF" ? "CPF" : "CNPJ"} *</Label>
              <Input
                id="customer-doc"
                value={doc}
                onChange={(e) => setDoc(e.target.value.replace(/\D/g, "").slice(0, type === "PF" ? 11 : 14))}
                placeholder={type === "PF" ? "Apenas numeros" : "Apenas numeros"}
                inputMode="numeric"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="customer-phone">Telefone (WhatsApp) *</Label>
              <Input
                id="customer-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="Com DDD"
                inputMode="numeric"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="customer-email">Email (opcional)</Label>
              <Input
                id="customer-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@exemplo.com"
              />
            </div>

            <DialogFooter className="gap-2 mt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                Cadastrar e usar
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
