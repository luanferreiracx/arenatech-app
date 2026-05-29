"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "@/lib/toast";

export interface QuickCreatedCustomer {
  id: string;
  name: string;
  cpf: string | null;
  cnpj: string | null;
}

interface CustomerQuickCreateProps {
  /** Chamado apos cadastrar com sucesso, com o cliente recem-criado. */
  onCreated: (customer: QuickCreatedCustomer) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

/**
 * Form de cadastro rapido de cliente (PF/PJ + nome + documento + telefone +
 * email). Reaproveitado pelo PDV e pela compra de aparelhos para cadastrar um
 * cliente sem sair do fluxo. Validacao espelha customer.create no servidor.
 */
export function CustomerQuickCreate({
  onCreated,
  onCancel,
  submitLabel = "Cadastrar e usar",
}: CustomerQuickCreateProps) {
  const trpc = useTRPC();
  const [type, setType] = useState<"PF" | "PJ">("PF");
  const [name, setName] = useState("");
  const [doc, setDoc] = useState(""); // CPF ou CNPJ conforme type
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Checagem de duplicidade por documento (so quando completo). NUNCA faz
  // auto-preenchimento via API externa — apenas alerta se ja existe cliente
  // com o mesmo CPF/CNPJ no tenant.
  const docDigits = doc.replace(/\D/g, "");
  const docComplete = type === "PF" ? docDigits.length === 11 : docDigits.length === 14;
  const dupQuery = useQuery(
    trpc.customer.checkDuplicate.queryOptions(
      type === "PF" ? { cpf: docDigits } : { cnpj: docDigits },
      { enabled: docComplete },
    ),
  );
  const duplicate = docComplete && dupQuery.data?.duplicate ? dupQuery.data.customer : null;

  const createMutation = useMutation(
    trpc.customer.create.mutationOptions({
      onSuccess: (created) => {
        toast.success(`Cliente ${created.name} cadastrado.`);
        onCreated({
          id: created.id,
          name: created.name,
          cpf: (created.cpf ?? null) as string | null,
          cnpj: (created.cnpj ?? null) as string | null,
        });
        setName("");
        setDoc("");
        setPhone("");
        setEmail("");
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
    if (type === "PF" && docDigits.length !== 11) {
      toast.error("CPF deve ter 11 digitos.");
      return;
    }
    if (type === "PJ" && docDigits.length !== 14) {
      toast.error("CNPJ deve ter 14 digitos.");
      return;
    }
    if (duplicate) {
      toast.error(`Ja existe um cliente com este ${type === "PF" ? "CPF" : "CNPJ"}: ${duplicate.name}.`);
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
    <div className="space-y-3">
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
        <Label htmlFor="quick-customer-name">
          {type === "PF" ? "Nome completo" : "Razao social"} *
        </Label>
        <Input
          id="quick-customer-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === "PF" ? "Ex: Maria da Silva" : "Ex: Loja XYZ Ltda"}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="quick-customer-doc">{type === "PF" ? "CPF" : "CNPJ"} *</Label>
        <Input
          id="quick-customer-doc"
          value={doc}
          onChange={(e) =>
            setDoc(e.target.value.replace(/\D/g, "").slice(0, type === "PF" ? 11 : 14))
          }
          placeholder="Apenas numeros"
          inputMode="numeric"
        />
        {duplicate && (
          <p className="text-xs text-destructive">
            Ja existe um cliente com este {type === "PF" ? "CPF" : "CNPJ"}:{" "}
            <strong>{duplicate.name}</strong>.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="quick-customer-phone">Telefone (WhatsApp) *</Label>
        <Input
          id="quick-customer-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
          placeholder="Com DDD"
          inputMode="numeric"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="quick-customer-email">Email (opcional)</Label>
        <Input
          id="quick-customer-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="cliente@exemplo.com"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="button" onClick={handleCreate} disabled={createMutation.isPending || !!duplicate}>
          {createMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="mr-2 h-4 w-4" />
          )}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
