"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Money } from "@/components/domain/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/inputs/money-input";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { LoadingState } from "@/components/domain/loading-state";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Star } from "lucide-react";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";

type RewardType = "DISCOUNT_PERCENTAGE" | "DISCOUNT_FIXED" | "CASHBACK" | "GIFT";

const REWARD_TYPE_LABELS: Record<RewardType, string> = {
  DISCOUNT_PERCENTAGE: "Desconto %",
  DISCOUNT_FIXED: "Desconto R$",
  CASHBACK: "Cashback",
  GIFT: "Brinde",
};

const PUBLICATION_LABELS: Record<string, string> = {
  story: "Story",
  reel: "Reel",
  post: "Post",
};

type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
  publicationType: string | null;
  rewardType: RewardType;
  value: number; // centavos
  percentage: number;
  maxCap: number | null;
  validityDays: number;
  participantLimit: number | null;
  rewardLimit: number | null;
  actionCount: number;
  active: boolean;
};

const emptyForm = {
  id: null as string | null,
  name: "",
  description: "",
  publicationType: "story",
  rewardType: "CASHBACK" as RewardType,
  value: 0,
  percentage: 0,
  maxCap: 0,
  validityDays: 30,
  participantLimit: "",
  rewardLimit: "",
};

export function RewardCampaignsManager() {
  // Criar/editar/ligar campanha define o VALOR da recompensa, que vira desconto
  // real no PDV — é ação de admin no servidor (auditoria 2026-07-25). Esconder
  // aqui evita o operador clicar e tomar FORBIDDEN.
  const isAdmin = useIsTenantAdmin();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [dialogOpen, setDialogOpen] = useState(false);

  const listQuery = useQuery(trpc.reward.listCampaigns.queryOptions({}));
  const rows = (listQuery.data?.data ?? []) as CampaignRow[];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.reward.listCampaigns.queryKey({}) });

  const createMut = useMutation(
    trpc.reward.createCampaign.mutationOptions({
      onSuccess: () => { toast.success("Campanha criada"); setDialogOpen(false); void invalidate(); },
      onError: (e) => toast.error(e.message),
    }),
  );
  const updateMut = useMutation(
    trpc.reward.updateCampaign.mutationOptions({
      onSuccess: () => { toast.success("Campanha atualizada"); setDialogOpen(false); void invalidate(); },
      onError: (e) => toast.error(e.message),
    }),
  );
  const toggleMut = useMutation(
    trpc.reward.toggleCampaign.mutationOptions({
      onSuccess: () => void invalidate(),
      onError: (e) => toast.error(e.message),
    }),
  );

  const openCreate = () => { setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (c: CampaignRow) => {
    setForm({
      id: c.id, name: c.name, description: c.description ?? "",
      publicationType: c.publicationType ?? "story", rewardType: c.rewardType,
      value: c.value, percentage: c.percentage, maxCap: c.maxCap ?? 0,
      validityDays: c.validityDays,
      participantLimit: c.participantLimit != null ? String(c.participantLimit) : "",
      rewardLimit: c.rewardLimit != null ? String(c.rewardLimit) : "",
    });
    setDialogOpen(true);
  };

  const isPercent = form.rewardType === "DISCOUNT_PERCENTAGE";

  const submit = () => {
    if (form.name.trim().length < 1) return toast.error("Informe o nome da campanha");
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      publicationType: form.publicationType || null,
      rewardType: form.rewardType,
      value: isPercent ? 0 : form.value,
      percentage: isPercent ? form.percentage : 0,
      maxCap: form.maxCap > 0 ? form.maxCap : null,
      validityDays: form.validityDays,
      participantLimit: form.participantLimit ? Number(form.participantLimit) : null,
      rewardLimit: form.rewardLimit ? Number(form.rewardLimit) : null,
    };
    if (form.id) updateMut.mutate({ id: form.id, ...payload });
    else createMut.mutate(payload);
  };

  if (listQuery.isLoading) return <LoadingState variant="table" />;

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nova campanha
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Nenhuma campanha de fidelidade"
          description={
            isAdmin
              ? "Crie uma campanha: o cliente publica sobre a loja (story/reel/post) e ganha desconto, cashback ou brinde."
              : "A loja ainda não tem campanha de fidelidade. Quem cria é o administrador."
          }
          // FDU-1: este CTA era gêmeo do botão do cabeçalho, que já é
          // `{isAdmin && …}` — mas nascia sem gate. Com zero campanhas (o estado
          // de produção hoje) ele era a ÚNICA ação que o operador via na aba, e
          // `createCampaign` recusa quem não é admin: um botão que só podia dar
          // 403. Mesma tela, dois gêmeos, um gateado e o outro não.
          action={isAdmin ? <Button onClick={openCreate}>Criar campanha</Button> : undefined}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Publicação</TableHead>
                <TableHead>Recompensa</TableHead>
                <TableHead className="text-center">Submissões</TableHead>
                <TableHead className="text-center">Ativa</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} className={c.active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.publicationType ? PUBLICATION_LABELS[c.publicationType] ?? c.publicationType : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusBadge variant="info">{REWARD_TYPE_LABELS[c.rewardType]}</StatusBadge>
                      <span className="text-sm tabular-nums">
                        {c.rewardType === "DISCOUNT_PERCENTAGE" ? `${c.percentage}%` : <Money cents={c.value} />}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{c.actionCount}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={c.active}
                      disabled={!isAdmin}
                      onCheckedChange={() => toggleMut.mutate({ id: c.id })}
                      aria-label={`${c.active ? "Desativar" : "Ativar"} ${c.name}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar campanha" : "Nova campanha de fidelidade"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: Poste e ganhe 5% de cashback" />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de publicação</Label>
                <Select value={form.publicationType} onValueChange={(v) => setForm((f) => ({ ...f, publicationType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="story">Story</SelectItem>
                    <SelectItem value="reel">Reel</SelectItem>
                    <SelectItem value="post">Post</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Recompensa</Label>
                <Select value={form.rewardType} onValueChange={(v) => setForm((f) => ({ ...f, rewardType: v as RewardType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(REWARD_TYPE_LABELS) as RewardType[]).map((t) => (
                      <SelectItem key={t} value={t}>{REWARD_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {isPercent ? (
                <div className="space-y-1">
                  <Label>Percentual (%)</Label>
                  <Input type="number" min={0} max={100} value={form.percentage} onChange={(e) => setForm((f) => ({ ...f, percentage: Number(e.target.value) }))} />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>{form.rewardType === "GIFT" ? "Valor do brinde" : "Valor"}</Label>
                  <MoneyInput value={form.value} onChange={(v) => setForm((f) => ({ ...f, value: v }))} />
                </div>
              )}
              <div className="space-y-1">
                <Label>Validade (dias)</Label>
                <Input type="number" min={1} max={365} value={form.validityDays} onChange={(e) => setForm((f) => ({ ...f, validityDays: Number(e.target.value) }))} />
              </div>
            </div>
            {isPercent && (
              <div className="space-y-1">
                <Label>Teto do desconto (opcional)</Label>
                <MoneyInput value={form.maxCap} onChange={(v) => setForm((f) => ({ ...f, maxCap: v }))} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Limite de participantes</Label>
                <Input type="number" min={1} placeholder="ilimitado" value={form.participantLimit} onChange={(e) => setForm((f) => ({ ...f, participantLimit: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Limite de recompensas</Label>
                <Input type="number" min={1} placeholder="ilimitado" value={form.rewardLimit} onChange={(e) => setForm((f) => ({ ...f, rewardLimit: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending}>
              {form.id ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
