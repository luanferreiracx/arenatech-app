"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Trash2, Phone, MessageSquare, Store } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/domain/page-header";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import {
  addInteractionSchema,
  type AddInteractionInput,
  INTEREST_STATUS_LABELS,
  INTEREST_TYPE_LABELS,
  INTERACTION_TYPE_LABELS,
  type InterestStatusValue,
} from "@/lib/validators/customer";

const INTERACTION_ICONS: Record<string, React.ReactNode> = {
  PHONE: <Phone className="h-4 w-4" />,
  WHATSAPP: <MessageSquare className="h-4 w-4" />,
  IN_STORE: <Store className="h-4 w-4" />,
};

export default function InterestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteInteractionId, setDeleteInteractionId] = useState<string | null>(null);

  const { data: interest, isLoading } = useQuery(
    trpc.interest.byId.queryOptions({ id }),
  );

  const updateStatusMutation = useMutation(
    trpc.interest.updateStatus.mutationOptions({
      onSuccess: () => {
        toast.success("Status atualizado");
        void queryClient.invalidateQueries({ queryKey: trpc.interest.byId.queryKey({ id }) });
        void queryClient.invalidateQueries({ queryKey: trpc.interest.list.queryKey() });
      },
      onError: (error: { message: string }) => toast.error(error.message),
    }),
  );

  const addInteractionMutation = useMutation(
    trpc.interest.addInteraction.mutationOptions({
      onSuccess: () => {
        toast.success("Interação registrada");
        void queryClient.invalidateQueries({ queryKey: trpc.interest.byId.queryKey({ id }) });
        void queryClient.invalidateQueries({ queryKey: trpc.interest.list.queryKey() });
        setDialogOpen(false);
        interactionForm.reset();
      },
      onError: (error: { message: string }) => toast.error(error.message),
    }),
  );

  const deleteInteractionMutation = useMutation(
    trpc.interest.deleteInteraction.mutationOptions({
      onSuccess: () => {
        toast.success("Interação excluída");
        void queryClient.invalidateQueries({ queryKey: trpc.interest.byId.queryKey({ id }) });
        setDeleteInteractionId(null);
      },
      onError: (error: { message: string }) => toast.error(error.message),
    }),
  );

  const interactionForm = useForm<AddInteractionInput>({
    resolver: zodResolver(addInteractionSchema),
    defaultValues: {
      interestId: id,
      type: "PHONE",
      description: "",
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!interest) {
    return <div className="p-6">Interesse não encontrado.</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader title={interest.customerName} />

      {/* Dados do lead */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados do lead</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Telefone</span>
              <span>{interest.phone ?? "—"}</span>
            </div>
            {interest.cpf && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">CPF</span>
                <span>{interest.cpf}</span>
              </div>
            )}
            {interest.email && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">E-mail</span>
                <span>{interest.email}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <StatusBadge variant="default">{INTEREST_TYPE_LABELS[interest.type] ?? interest.type}</StatusBadge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Modelo desejado</span>
              <span>{interest.desiredModel ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge variant="default">{INTEREST_STATUS_LABELS[interest.status] ?? interest.status}</StatusBadge>
            </div>
            {interest.notes && (
              <div>
                <span className="text-muted-foreground">Observações</span>
                <p className="mt-1 whitespace-pre-wrap">{interest.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status change */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Alterar status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(["WAITING", "CONTACTED", "COMPLETED", "CANCELLED"] as InterestStatusValue[]).map((status) => (
                <Button
                  key={status}
                  variant={interest.status === status ? "default" : "outline"}
                  size="sm"
                  disabled={interest.status === status || updateStatusMutation.isPending}
                  onClick={() => updateStatusMutation.mutate({ id, status })}
                >
                  {INTEREST_STATUS_LABELS[status]}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interações */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Interações</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Nova interação
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar interação</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={interactionForm.handleSubmit((data) => addInteractionMutation.mutate(data))}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select
                    value={interactionForm.watch("type")}
                    onValueChange={(v: string) => interactionForm.setValue("type", v as AddInteractionInput["type"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(INTERACTION_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descrição *</Label>
                  <Textarea {...interactionForm.register("description")} rows={3} placeholder="Descreva a interação..." />
                  {interactionForm.formState.errors.description && (
                    <p className="text-sm text-destructive">{interactionForm.formState.errors.description.message}</p>
                  )}
                </div>
                <Button type="submit" disabled={addInteractionMutation.isPending} className="w-full">
                  {addInteractionMutation.isPending ? "Registrando..." : "Registrar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {interest.interactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma interação registrada.</p>
          ) : (
            <div className="space-y-3">
              {interest.interactions.map((interaction) => (
                <div key={interaction.id} className="flex items-start gap-3 rounded-md border p-3">
                  <div className="mt-0.5 text-muted-foreground">
                    {INTERACTION_ICONS[interaction.type] ?? <MessageSquare className="h-4 w-4" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">
                        {INTERACTION_TYPE_LABELS[interaction.type] ?? interaction.type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(interaction.occurredAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{interaction.description}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteInteractionId(interaction.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Delete interaction confirm */}
      <ConfirmDialog
        open={!!deleteInteractionId}
        onOpenChange={(open) => { if (!open) setDeleteInteractionId(null); }}
        title="Excluir interação"
        description="Deseja excluir esta interação?"
        onConfirm={() => { if (deleteInteractionId) deleteInteractionMutation.mutate({ id: deleteInteractionId }); }}
        variant="destructive"
      />
    </div>
  );
}
