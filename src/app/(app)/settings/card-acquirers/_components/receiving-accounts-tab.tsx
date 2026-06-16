"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  RECEIVING_ACCOUNT_TYPE_LABELS,
  type ReceivingAccountType,
} from "@/lib/validators/receiving";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/domain/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Landmark, Loader2, Pencil, Star } from "lucide-react";

interface AccountDraft {
  id: string | null;
  name: string;
  type: ReceivingAccountType;
  bankName: string;
  agency: string;
  accountNumber: string;
  pixKey: string;
  isDefault: boolean;
}

const EMPTY_DRAFT: AccountDraft = {
  id: null,
  name: "",
  type: "BANK",
  bankName: "",
  agency: "",
  accountNumber: "",
  pixKey: "",
  isDefault: false,
};

export function ReceivingAccountsTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AccountDraft | null>(null);

  const { data: accounts, isLoading } = useQuery(trpc.receiving.accounts.list.queryOptions());

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [["receiving", "accounts"]] });

  const createMutation = useMutation(
    trpc.receiving.accounts.create.mutationOptions({
      onSuccess: () => {
        toast.success("Conta criada!");
        invalidate();
        setDraft(null);
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.receiving.accounts.update.mutationOptions({
      onSuccess: () => {
        toast.success("Conta atualizada!");
        invalidate();
        setDraft(null);
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const toggleMutation = useMutation(
    trpc.receiving.accounts.toggle.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message),
    }),
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isBankLike = draft?.type === "BANK";
  const isPixLike = draft?.type === "PIX";

  const handleSave = () => {
    if (!draft || draft.name.trim().length === 0) return;
    const payload = {
      name: draft.name.trim(),
      type: draft.type,
      bankName: draft.bankName.trim() || undefined,
      agency: draft.agency.trim() || undefined,
      accountNumber: draft.accountNumber.trim() || undefined,
      pixKey: draft.pixKey.trim() || undefined,
      isDefault: draft.isDefault,
    };
    if (draft.id) {
      updateMutation.mutate({ id: draft.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Conta
        </Button>
      </div>

      {!accounts || accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma conta de recebimento"
          description="Cadastre as contas onde o dinheiro das vendas é depositado (caixa, banco, PIX)."
          action={
            <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <Card key={account.id} className={account.active ? "" : "opacity-60"}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                    {account.isDefault && <Star className="w-3.5 h-3.5 fill-primary text-primary" />}
                    {account.name}
                  </CardTitle>
                  <Switch
                    checked={account.active}
                    onCheckedChange={(active) => toggleMutation.mutate({ id: account.id, active })}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {RECEIVING_ACCOUNT_TYPE_LABELS[account.type as ReceivingAccountType] ?? account.type}
                  </Badge>
                  {account.isDefault && <Badge variant="secondary">Padrão</Badge>}
                </div>
                {(account.bankName || account.pixKey) && (
                  <p className="text-xs text-muted-foreground truncate">
                    {account.bankName
                      ? `${account.bankName}${account.agency ? ` · Ag ${account.agency}` : ""}${account.accountNumber ? ` · Cc ${account.accountNumber}` : ""}`
                      : account.pixKey}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      id: account.id,
                      name: account.name,
                      type: account.type as ReceivingAccountType,
                      bankName: account.bankName ?? "",
                      agency: account.agency ?? "",
                      accountNumber: account.accountNumber ?? "",
                      pixKey: account.pixKey ?? "",
                      isDefault: account.isDefault,
                    })
                  }
                >
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  Editar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar conta" : "Nova conta de recebimento"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nome *</label>
                  <Input
                    autoFocus
                    value={draft.name}
                    placeholder="Ex: Conta Itaú, Caixa loja"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tipo *</label>
                  <Select
                    value={draft.type}
                    onValueChange={(v) => setDraft({ ...draft, type: v as ReceivingAccountType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.entries(RECEIVING_ACCOUNT_TYPE_LABELS) as [
                          ReceivingAccountType,
                          string,
                        ][]
                      ).map(([v, label]) => (
                        <SelectItem key={v} value={v}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isBankLike && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5 col-span-3">
                    <label className="text-sm font-medium">Banco</label>
                    <Input
                      value={draft.bankName}
                      placeholder="Ex: Itaú, Bradesco"
                      onChange={(e) => setDraft({ ...draft, bankName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Agência</label>
                    <Input
                      value={draft.agency}
                      onChange={(e) => setDraft({ ...draft, agency: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-sm font-medium">Conta</label>
                    <Input
                      value={draft.accountNumber}
                      onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {isPixLike && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Chave PIX</label>
                  <Input
                    value={draft.pixKey}
                    onChange={(e) => setDraft({ ...draft, pixKey: e.target.value })}
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={draft.isDefault}
                  onCheckedChange={(isDefault) => setDraft({ ...draft, isDefault })}
                />
                Definir como conta padrão
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !draft?.name.trim()}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
