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
import { Plus, Landmark, Loader2, Pencil, Star, TriangleAlert } from "lucide-react";
import { Money } from "@/components/domain/money";

/** Início da janela de 30 dias, em `YYYY-MM-DD` (o filtro corta o dia em BRT). */
function last30DaysIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

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

  // Movimentação por conta nos últimos 30 dias (ADR 0069). A janela é fixa de
  // propósito: aqui a pergunta é "esta conta está viva e bate com o extrato?",
  // não análise financeira — essa mora no Financeiro.
  const { data: balances } = useQuery(
    trpc.receiving.accounts.balances.queryOptions({ dateFrom: last30DaysIso() }),
  );
  const movementByAccount = new Map(
    (balances?.accounts ?? []).map((a) => [a.id, { netCents: a.netCents }]),
  );

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

      {/* Dinheiro que se moveu sem conta atribuída. Fica VISÍVEL de propósito:
          esconder daria a ilusão de que tudo está conciliado. O caminho da
          correção é cadastrar a conta padrão da forma de pagamento. */}
      {(balances?.unassigned.movements ?? 0) > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              <Money cents={balances!.unassigned.netCents} /> sem conta nos ultimos 30 dias
            </p>
            <p className="text-muted-foreground">
              {balances!.unassigned.movements} lancamento(s) nao dizem de qual conta o
              dinheiro saiu ou entrou. Defina a conta padrao de cada forma de pagamento
              para os proximos ja nascerem certos.
            </p>
          </div>
        </div>
      )}

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
                {/* Movimentado no período (ADR 0069) — é o que torna a conta
                    conferível contra o extrato. Sem isto a conta seria só um
                    rótulo que ninguém verifica. */}
                <div className="border-t pt-2">
                  <p className="text-xs text-muted-foreground">Movimentado (30 dias)</p>
                  <Money
                    cents={movementByAccount.get(account.id)?.netCents ?? 0}
                    className="text-base font-semibold"
                  />
                </div>
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
                // responsive-audit-ignore: layout de conta bancária (Banco/Agência/Conta), agência de 4 díg. cabe a 320px; col-span depende de 3 colunas
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
