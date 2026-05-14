"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Heart,
  Pencil,
  CheckCircle,
  XCircle,
  MessageSquare,
  Loader2,
  User,
  Phone,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import {
  INTEREST_STATUS_LABELS,
  INTEREST_TYPE_LABELS,
  INTEREST_PRIORITY_LABELS,
} from "@/lib/validators/customer";
import { toast } from "@/lib/toast";

const STATUS_COLORS: Record<string, string> = {
  WAITING: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  CONTACTED: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  FINISHED: "bg-green-500/10 text-green-500 border-green-500/20",
  CANCELLED: "bg-red-500/10 text-red-500 border-red-500/20",
};

export default function InterestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: interest, isLoading } = useQuery(
    trpc.interest.getById.queryOptions({ id })
  );

  const [showInteraction, setShowInteraction] = useState(false);
  const [showStatus, setShowStatus] = useState<"FINISHED" | "CANCELLED" | null>(null);
  const [interactionType, setInteractionType] = useState("WhatsApp");
  const [interactionDesc, setInteractionDesc] = useState("");
  const [statusReason, setStatusReason] = useState("");

  const addInteractionMutation = useMutation(
    trpc.interest.addInteraction.mutationOptions({
      onSuccess: () => {
        toast.success("Interacao registrada");
        queryClient.invalidateQueries({ queryKey: [["interest"]] });
        setShowInteraction(false);
        setInteractionDesc("");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const changeStatusMutation = useMutation(
    trpc.interest.changeStatus.mutationOptions({
      onSuccess: () => {
        toast.success("Status atualizado");
        queryClient.invalidateQueries({ queryKey: [["interest"]] });
        setShowStatus(null);
        setStatusReason("");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  if (isLoading) return <LoadingState />;
  if (!interest) return <div className="text-center py-12 text-muted-foreground">Interesse nao encontrado</div>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const i = interest as any;
  const customer = i.customer as { id: string; name: string; phone?: string; cpf?: string; email?: string } | null;
  const interactions = (i.interactions ?? []) as Array<{
    id: string;
    interactionType: string;
    description: string;
    userName: string;
    createdAt: string;
  }>;
  const status = i.status as string;
  const isClosed = status === "FINISHED" || status === "CANCELLED";

  const formatCurrency = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href="/interests"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <Heart className="h-5 w-5 text-primary" />
            <span>{(i.product as string) ?? "Interesse"}</span>
            <Badge variant="outline" className={STATUS_COLORS[status] ?? ""}>
              {INTEREST_STATUS_LABELS[status] ?? status}
            </Badge>
          </div>
        }
        actions={
          !isClosed && (
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href={`/interests/${id}/edit`}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Editar
                </Link>
              </Button>
              <Button onClick={() => setShowInteraction(true)}>
                <MessageSquare className="w-4 h-4 mr-2" />
                Nova Interacao
              </Button>
              <Button
                variant="outline"
                className="text-green-500 border-green-500/30"
                onClick={() => { setStatusReason(""); setShowStatus("FINISHED"); }}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Finalizar
              </Button>
              <Button
                variant="outline"
                className="text-destructive border-destructive/30"
                onClick={() => { setStatusReason(""); setShowStatus("CANCELLED"); }}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Customer Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4" /> Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{customer?.name ?? "-"}</p>
            {customer?.phone && (
              <p className="flex items-center gap-1 text-green-400">
                <Phone className="h-3 w-3" /> {customer.phone}
              </p>
            )}
            {customer?.email && (
              <p className="flex items-center gap-1 text-muted-foreground">
                <Mail className="h-3 w-3" /> {customer.email}
              </p>
            )}
            {customer?.cpf && <p className="font-mono text-xs">CPF: {customer.cpf}</p>}
            {customer?.id && (
              <Link href={`/customers/${customer.id}`} className="text-xs text-primary hover:underline">
                Ver perfil completo
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Interest Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Heart className="h-4 w-4" /> Dados do Interesse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <span>{INTEREST_TYPE_LABELS[String(i.interestType)] ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Produto</span>
              <span>{String(i.product ?? "-")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor Estimado</span>
              <span>{Number(i.estimatedValue) ? formatCurrency(Number(i.estimatedValue)) : "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Prioridade</span>
              <span className={
                String(i.priority) === "alta" ? "text-red-500 font-medium" :
                String(i.priority) === "media" ? "text-yellow-500" : "text-green-500"
              }>
                {INTEREST_PRIORITY_LABELS[String(i.priority)] ?? "-"}
              </span>
            </div>
            {i.assignedUserName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Responsavel</span>
                <span>{String(i.assignedUserName)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Registro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Criado em</span>
              <span>{new Date(i.createdAt as string).toLocaleDateString("pt-BR")}</span>
            </div>
            {i.followUpAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Follow-up</span>
                <span>{new Date(i.followUpAt as string).toLocaleDateString("pt-BR")}</span>
              </div>
            )}
            {i.statusChangeReason && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground text-xs">Motivo da mudanca:</p>
                <p className="text-xs mt-1">{String(i.statusChangeReason)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {i.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Descricao</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{String(i.description)}</p>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {i.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Observacoes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{String(i.notes)}</p>
          </CardContent>
        </Card>
      )}

      {/* Interactions Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Historico de Interacoes ({interactions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {interactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">Nenhuma interacao registrada.</p>
          ) : (
            <div className="space-y-4 relative pl-6 before:absolute before:left-2 before:top-0 before:bottom-0 before:w-0.5 before:bg-border">
              {interactions.map((inter) => (
                <div key={inter.id} className="relative">
                  <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-primary border-2 border-background shadow" />
                  <div className="bg-muted/50 rounded-lg p-3 border">
                    <div className="flex justify-between items-center mb-1 text-xs">
                      <Badge variant="outline" className="text-xs">{inter.interactionType}</Badge>
                      <span className="text-muted-foreground">
                        {new Date(inter.createdAt).toLocaleDateString("pt-BR")} por {inter.userName}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{inter.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Interaction Dialog */}
      <Dialog open={showInteraction} onOpenChange={setShowInteraction}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Interacao</DialogTitle>
            <DialogDescription>Registre o contato realizado com o cliente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de Interacao</Label>
              <Select value={interactionType} onValueChange={setInteractionType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                  <SelectItem value="Telefone">Telefone</SelectItem>
                  <SelectItem value="E-mail">E-mail</SelectItem>
                  <SelectItem value="Presencial">Presencial</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descricao</Label>
              <Textarea
                value={interactionDesc}
                onChange={(e) => setInteractionDesc(e.target.value)}
                placeholder="Descreva o que foi conversado..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInteraction(false)}>Cancelar</Button>
            <Button
              onClick={() => addInteractionMutation.mutate({
                interestId: id,
                interactionType,
                description: interactionDesc,
              })}
              disabled={addInteractionMutation.isPending || !interactionDesc.trim()}
            >
              {addInteractionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Status Dialog */}
      <Dialog open={showStatus !== null} onOpenChange={(open) => !open && setShowStatus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showStatus === "FINISHED" ? "Finalizar Interesse" : "Cancelar Interesse"}
            </DialogTitle>
            <DialogDescription>Informe o motivo da mudanca</DialogDescription>
          </DialogHeader>
          <div>
            <Label>{showStatus === "FINISHED" ? "Descricao da finalizacao" : "Motivo do cancelamento"}</Label>
            <Textarea
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="Descreva o motivo (minimo 10 caracteres)..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatus(null)}>Voltar</Button>
            <Button
              variant={showStatus === "CANCELLED" ? "destructive" : "default"}
              onClick={() => {
                if (showStatus) {
                  changeStatusMutation.mutate({ id, status: showStatus, reason: statusReason });
                }
              }}
              disabled={changeStatusMutation.isPending || statusReason.length < 10}
            >
              {changeStatusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
