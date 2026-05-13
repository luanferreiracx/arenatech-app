"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/domain/status-badge";
import { LoadingState } from "@/components/domain/loading-state";
import { toast } from "@/lib/toast";
import { PRE_REGISTRATION_STATUS_LABELS, PRE_REGISTRATION_STATUS_VARIANT } from "@/lib/validators/admin";

export function PreRegistrationDetail({ preRegId }: { preRegId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const preRegQuery = useQuery(trpc.admin.getPreRegistration.queryOptions({ id: preRegId }));
  const approveMutation = useMutation(trpc.admin.approvePreRegistration.mutationOptions());
  const rejectMutation = useMutation(trpc.admin.rejectPreRegistration.mutationOptions());

  const pr = preRegQuery.data;

  if (preRegQuery.isLoading) return <LoadingState />;
  if (!pr) return <p className="text-muted-foreground">Pre-cadastro nao encontrado</p>;

  const handleApprove = () => {
    approveMutation.mutate(
      { id: preRegId },
      {
        onSuccess: (result) => {
          toast.success(`Aprovado! Senha temporaria: ${result.tempPassword}`);
          queryClient.invalidateQueries({ queryKey: trpc.admin.getPreRegistration.queryKey({ id: preRegId }) });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleReject = () => {
    rejectMutation.mutate(
      { id: preRegId, reason: rejectReason },
      {
        onSuccess: () => {
          toast.success("Rejeitado");
          setShowRejectDialog(false);
          queryClient.invalidateQueries({ queryKey: trpc.admin.getPreRegistration.queryKey({ id: preRegId }) });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{pr.tradeName}</CardTitle>
            <StatusBadge variant={PRE_REGISTRATION_STATUS_VARIANT[pr.status] ?? "default"}>
              {PRE_REGISTRATION_STATUS_LABELS[pr.status] ?? pr.status}
            </StatusBadge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div><span className="text-muted-foreground">Razao Social:</span><p className="font-medium">{pr.legalName ?? "-"}</p></div>
            <div><span className="text-muted-foreground">CNPJ:</span><p className="font-medium">{pr.cnpj ?? "-"}</p></div>
            <div><span className="text-muted-foreground">Responsavel:</span><p className="font-medium">{pr.ownerName}</p></div>
            <div><span className="text-muted-foreground">CPF:</span><p className="font-medium">{pr.ownerCpf}</p></div>
            <div><span className="text-muted-foreground">Email:</span><p className="font-medium">{pr.ownerEmail}</p></div>
            <div><span className="text-muted-foreground">Telefone:</span><p className="font-medium">{pr.ownerPhone}</p></div>
            {pr.notes && (
              <div className="col-span-2"><span className="text-muted-foreground">Observacoes:</span><p>{pr.notes}</p></div>
            )}
          </div>
        </CardContent>
      </Card>

      {pr.status === "PENDING" && (
        <div className="flex gap-3">
          <Button onClick={handleApprove} disabled={approveMutation.isPending}>
            <CheckCircle className="mr-2 h-4 w-4" />
            Aprovar
          </Button>
          <Button variant="destructive" onClick={() => setShowRejectDialog(true)}>
            <XCircle className="mr-2 h-4 w-4" />
            Rejeitar
          </Button>
        </div>
      )}

      <Button variant="outline" onClick={() => router.push("/admin/pre-registrations")}>Voltar</Button>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Pre-cadastro</DialogTitle>
            <DialogDescription>Informe o motivo da rejeicao</DialogDescription>
          </DialogHeader>
          <div><Label>Motivo</Label><Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejectReason.length < 1 || rejectMutation.isPending}>Rejeitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
