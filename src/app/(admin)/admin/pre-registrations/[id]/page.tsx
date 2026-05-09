"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { PageHeader } from "@/components/domain/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/domain/status-badge";
import { LoadingState } from "@/components/domain/loading-state";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";
import { preRegistrationStatusLabels } from "@/lib/validators/admin";
import { ArrowLeft, Check, X } from "lucide-react";
import { useState } from "react";

function getStatusVariant(status: string) {
  const map: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
    PENDING: "warning",
    APPROVED: "success",
    REJECTED: "destructive",
  };
  return map[status] ?? "default";
}

export default function PreRegistrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const trpc = useTRPC();
  const router = useRouter();
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);

  const { data: reg, isLoading, refetch } = useQuery(
    trpc.admin.getPreRegistration.queryOptions({ id }),
  );

  const approveMutation = useMutation(
    trpc.admin.approvePreRegistration.mutationOptions({
      onSuccess: () => {
        toast.success("Pre-cadastro aprovado! Tenant e usuario criados.");
        setShowApprove(false);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const rejectMutation = useMutation(
    trpc.admin.rejectPreRegistration.mutationOptions({
      onSuccess: () => {
        toast.success("Pre-cadastro rejeitado.");
        setShowReject(false);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (isLoading) return <LoadingState variant="card" />;
  if (!reg) return <p>Pre-cadastro nao encontrado</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={reg.tradeName}
        subtitle="Detalhe do pre-cadastro"
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push("/admin/pre-registrations")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Dados
            <StatusBadge variant={getStatusVariant(reg.status)}>
              {preRegistrationStatusLabels[reg.status] ?? reg.status}
            </StatusBadge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-muted-foreground">Nome Fantasia</span>
              <p className="font-medium">{reg.tradeName}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Razao Social</span>
              <p className="font-medium">{reg.legalName ?? "—"}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">CNPJ</span>
              <p className="font-medium">{reg.cnpj ?? "—"}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Responsavel</span>
              <p className="font-medium">{reg.ownerName}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">CPF</span>
              <p className="font-medium">{reg.ownerCpf}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Email</span>
              <p className="font-medium">{reg.ownerEmail}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Telefone</span>
              <p className="font-medium">{reg.ownerPhone}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Criado em</span>
              <p className="font-medium">{new Date(reg.createdAt).toLocaleDateString("pt-BR")}</p>
            </div>
          </div>
          {reg.notes && (
            <div className="pt-2">
              <span className="text-sm text-muted-foreground">Observacoes</span>
              <p>{reg.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {reg.status === "PENDING" && (
        <div className="flex gap-3">
          <Button onClick={() => setShowApprove(true)} className="bg-success hover:bg-success/90">
            <Check className="w-4 h-4 mr-1" /> Aprovar
          </Button>
          <Button variant="destructive" onClick={() => setShowReject(true)}>
            <X className="w-4 h-4 mr-1" /> Rejeitar
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={showApprove}
        onOpenChange={setShowApprove}
        title="Aprovar pre-cadastro?"
        description={`Sera criado um tenant "${reg.tradeName}" e um usuario para "${reg.ownerName}" com senha temporaria.`}
        confirmLabel="Aprovar"
        onConfirm={() => approveMutation.mutate({ id })}
        isLoading={approveMutation.isPending}
      />

      <ConfirmDialog
        open={showReject}
        onOpenChange={setShowReject}
        title="Rejeitar pre-cadastro?"
        description="O pre-cadastro sera marcado como REJEITADO."
        confirmLabel="Rejeitar"
        onConfirm={() => rejectMutation.mutate({ id })}
        isLoading={rejectMutation.isPending}
        variant="destructive"
      />
    </div>
  );
}
