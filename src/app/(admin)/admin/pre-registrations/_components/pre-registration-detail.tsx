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
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/domain/loading-state";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { PRE_REGISTRATION_STATUS_LABELS, PRE_REGISTRATION_STATUS_VARIANT } from "@/lib/validators/admin";
import { formatCentsBRL } from "@/lib/format";

export function PreRegistrationDetail({ preRegId }: { preRegId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Modo de aprovação (ADR 0066). `plan` = abre teste grátis no plano; `wallet`
  // = só a Carteira DePix, sem plano e sem assinatura.
  const [approvalMode, setApprovalMode] = useState<"plan" | "wallet">("plan");
  const [overridePlanId, setOverridePlanId] = useState<string | null>(null);

  const preRegQuery = useQuery(trpc.admin.getPreRegistration.queryOptions({ id: preRegId }));
  // Só os ATIVOS: aprovar num plano inativo seria recusado pelo servidor, e
  // oferecê-lo na lista é convidar o erro.
  const plansQuery = useQuery(trpc.admin.listPlans.queryOptions({ status: "ACTIVE" }));
  const approveMutation = useMutation(trpc.admin.approvePreRegistration.mutationOptions());
  const rejectMutation = useMutation(trpc.admin.rejectPreRegistration.mutationOptions());

  const pr = preRegQuery.data;

  if (preRegQuery.isLoading) return <LoadingState />;
  if (!pr) return <p className="text-muted-foreground">Pre-cadastro nao encontrado</p>;

  const handleApprove = () => {
    approveMutation.mutate(
      approvalMode === "wallet"
        ? { id: preRegId, walletOnly: true }
        : { id: preRegId, planId: overridePlanId ?? undefined },
      {
        onSuccess: (result) => {
          const detalhe = result.trialEndsAt
            ? ` Teste grátis até ${new Date(result.trialEndsAt).toLocaleDateString("pt-BR")}.`
            : approvalMode === "wallet"
              ? " Acesso só à Carteira DePix, sem assinatura."
              : "";
          toast.success(
            (result.tempPassword
              ? `Aprovado! Senha temporaria: ${result.tempPassword}`
              : "Aprovado! Responsavel ja existia no sistema.") + detalhe,
          );
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
          {/* Tipo inferido pela presença de documento (ADR 0050): sem CPF = NO-KYC. */}
          {(() => {
            const isNoKyc = !pr.ownerCpf;
            return (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 flex flex-wrap items-center gap-2">
                  <Badge variant={isNoKyc ? "secondary" : "default"}>
                    {isNoKyc ? "NO-KYC (e-mail)" : "KYC (CPF/CNPJ)"}
                  </Badge>
                  {isNoKyc && (
                    <>
                      <Badge variant={pr.emailVerifiedAt ? "default" : "outline"}>
                        {pr.emailVerifiedAt ? "E-mail verificado" : "E-mail não verificado"}
                      </Badge>
                      <Badge variant={pr.phoneVerifiedAt ? "default" : "outline"}>
                        {pr.phoneVerifiedAt ? "WhatsApp verificado" : "WhatsApp não verificado"}
                      </Badge>
                    </>
                  )}
                </div>
                {!isNoKyc && (
                  <>
                    <div><span className="text-muted-foreground">Razao Social:</span><p className="font-medium">{pr.legalName ?? "-"}</p></div>
                    <div><span className="text-muted-foreground">CNPJ:</span><p className="font-medium">{pr.cnpj ?? "-"}</p></div>
                  </>
                )}
                <div><span className="text-muted-foreground">Responsavel:</span><p className="font-medium">{pr.ownerName}</p></div>
                {!isNoKyc && (
                  <div><span className="text-muted-foreground">CPF:</span><p className="font-medium">{pr.ownerCpf}</p></div>
                )}
                <div><span className="text-muted-foreground">Email:</span><p className="font-medium">{pr.ownerEmail}</p></div>
                <div><span className="text-muted-foreground">Telefone:</span><p className="font-medium">{pr.ownerPhone}</p></div>
                {/* Plano escolhido pelo cliente na página de preços. Aprovar
                    abre o TESTE GRÁTIS nele (ADR 0061) — sem mostrar aqui, o
                    superadmin confirma uma cobrança futura que não viu. */}
                <div className="col-span-2">
                  <span className="text-muted-foreground">Plano escolhido:</span>
                  {pr.plan ? (
                    <p className="min-w-0 break-words font-medium">
                      {pr.plan.name}{" "}
                      <span className="tabular-nums text-muted-foreground">
                        ({formatCentsBRL(pr.plan.monthlyPriceCents)}/mês após o teste)
                      </span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      Nenhum — o cliente se cadastrou sem escolher. Escolha abaixo
                      como aprovar.
                    </p>
                  )}
                </div>
                {pr.notes && (
                  <div className="col-span-2"><span className="text-muted-foreground">Observacoes:</span><p>{pr.notes}</p></div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {pr.status === "PENDING" && (
        <>
          {/* Modo de aprovação explícito (ADR 0066). Antes, aprovar era um botão
              só: quem quisesse um cliente só-carteira aprovava e tinha que
              lembrar de ligar o gate DePix na ficha do tenant, num segundo
              passo. Esquecer deixava o cliente numa tela vazia — sem plano e sem
              carteira —, e quem pagava era justamente quem só veio pela
              carteira. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Como aprovar</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={approvalMode}
                onValueChange={(v) => setApprovalMode(v as "plan" | "wallet")}
                className="gap-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <RadioGroupItem value="plan" id="modo-plano" className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="modo-plano" className="font-medium">
                      Com plano — inicia o teste grátis
                    </Label>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      Abre assinatura em teste no plano escolhido. A cobrança começa
                      quando o teste terminar.
                    </p>

                    {approvalMode === "plan" && (
                      <div className="mt-3 max-w-sm">
                        <Label htmlFor="plano-aprovacao" className="text-sm">
                          Plano
                        </Label>
                        <Select
                          value={overridePlanId ?? pr.plan?.id ?? ""}
                          onValueChange={(v) => setOverridePlanId(v)}
                        >
                          <SelectTrigger id="plano-aprovacao" className="mt-1.5">
                            <SelectValue placeholder="Escolha o plano" />
                          </SelectTrigger>
                          <SelectContent>
                            {(plansQuery.data ?? []).map((plano) => (
                              <SelectItem key={plano.id} value={plano.id}>
                                {plano.name} — {formatCentsBRL(plano.monthlyPrice)}/mês
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!pr.plan && !overridePlanId && (
                          <p className="mt-1.5 break-words text-xs text-warning">
                            O cliente não escolheu plano. Selecione um, ou aprove só
                            com a carteira.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex min-w-0 items-start gap-3">
                  <RadioGroupItem value="wallet" id="modo-carteira" className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="modo-carteira" className="font-medium">
                      Só a Carteira DePix — sem plano, sem cobrança
                    </Label>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      Para quem só quer a carteira: acesso a saldo, saques e link de
                      cobrança. Sem PDV, sem ordens de serviço, sem assinatura — a
                      receita vem da taxa das transações. O plano pode ser definido
                      depois, na ficha do tenant.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleApprove}
              // Aprovar "com plano" sem plano nenhum criaria um tenant sem plano
              // E sem carteira: a tela vazia que este card existe para evitar.
              disabled={
                approveMutation.isPending ||
                (approvalMode === "plan" && !pr.plan && !overridePlanId)
              }
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {approvalMode === "wallet" ? "Aprovar só com carteira" : "Aprovar e iniciar teste"}
            </Button>
            <Button variant="destructive" onClick={() => setShowRejectDialog(true)}>
              <XCircle className="mr-2 h-4 w-4" />
              Rejeitar
            </Button>
          </div>
        </>
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
