"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Download, XCircle, CheckCircle, Edit, Mail } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/domain/status-badge";
import { LoadingState } from "@/components/domain/loading-state";
import { toast } from "@/lib/toast";
import {
  INVOICE_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANT,
} from "@/lib/validators/fiscal";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [emailAddress, setEmailAddress] = useState("");

  const invoiceQuery = useQuery(trpc.fiscal.getById.queryOptions({ id: invoiceId }));
  const authorizeMutation = useMutation(trpc.fiscal.authorize.mutationOptions());
  const cancelMutation = useMutation(trpc.fiscal.cancel.mutationOptions());
  const correctionMutation = useMutation(trpc.fiscal.correctionLetter.mutationOptions());
  const sendEmailMutation = useMutation(trpc.fiscal.sendEmail.mutationOptions());

  const invoice = invoiceQuery.data;

  if (invoiceQuery.isLoading) return <LoadingState />;
  if (!invoice) return <p className="text-muted-foreground">Nota fiscal nao encontrada</p>;

  const handleAuthorize = () => {
    authorizeMutation.mutate(
      { invoiceId },
      {
        onSuccess: () => {
          toast.success("Nota autorizada com sucesso");
          queryClient.invalidateQueries({ queryKey: trpc.fiscal.getById.queryKey({ id: invoiceId }) });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleCancel = () => {
    cancelMutation.mutate(
      { invoiceId, reason: cancelReason },
      {
        onSuccess: () => {
          toast.success("Nota cancelada");
          setShowCancelDialog(false);
          queryClient.invalidateQueries({ queryKey: trpc.fiscal.getById.queryKey({ id: invoiceId }) });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleCorrection = () => {
    correctionMutation.mutate(
      { invoiceId, reason: correctionReason },
      {
        onSuccess: () => {
          toast.success("Carta de correcao enviada");
          setShowCorrectionDialog(false);
          queryClient.invalidateQueries({ queryKey: trpc.fiscal.getById.queryKey({ id: invoiceId }) });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleSendEmail = () => {
    sendEmailMutation.mutate(
      { invoiceId, email: emailAddress },
      {
        onSuccess: () => {
          toast.success("Email enviado com sucesso");
          setShowEmailDialog(false);
          setEmailAddress("");
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {INVOICE_TYPE_LABELS[invoice.type] ?? invoice.type} #{invoice.number ?? invoice.id.slice(0, 8)}
            </CardTitle>
            <StatusBadge
              variant={INVOICE_STATUS_VARIANT[invoice.status] ?? "default"}>
              {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
            </StatusBadge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Destinatario:</span>
              <p className="font-medium">{invoice.recipientName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">CPF/CNPJ:</span>
              <p className="font-medium">{invoice.recipientCpfCnpj || "-"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Valor Total:</span>
              <p className="font-medium text-lg">{formatCurrency(invoice.totalAmount)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Data:</span>
              <p className="font-medium">{new Date(invoice.createdAt).toLocaleDateString("pt-BR")}</p>
            </div>
            {invoice.accessKey && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Chave de Acesso:</span>
                <p className="font-mono text-xs break-all">{invoice.accessKey}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle>Itens</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Descricao</th>
                <th className="text-right py-2">Qtd</th>
                <th className="text-right py-2">Preco Unit.</th>
                <th className="text-right py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id} className="border-b last:border-b-0">
                  <td className="py-2">{item.description}</td>
                  <td className="text-right py-2">{item.quantity}</td>
                  <td className="text-right py-2">{formatCurrency(item.unitPrice)}</td>
                  <td className="text-right py-2 font-medium">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {(invoice.status === "DRAFT" || invoice.status === "REJECTED") && (
          <Button onClick={handleAuthorize} disabled={authorizeMutation.isPending}>
            <CheckCircle className="mr-2 h-4 w-4" />
            {authorizeMutation.isPending ? "Autorizando..." : "Autorizar"}
          </Button>
        )}
        {(invoice.status === "AUTHORIZED" || invoice.status === "CORRECTION_LETTER") && (
          <>
            <Button variant="outline" onClick={() => setShowEmailDialog(true)}>
              <Mail className="mr-2 h-4 w-4" />
              Enviar por Email
            </Button>
            {invoice.status === "AUTHORIZED" && (
              <>
                <Button variant="destructive" onClick={() => setShowCancelDialog(true)}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancelar Nota
                </Button>
                <Button variant="outline" onClick={() => setShowCorrectionDialog(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Carta de Correcao
                </Button>
              </>
            )}
          </>
        )}
        <Button variant="outline" onClick={() => router.push("/fiscal")}>
          Voltar
        </Button>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Nota Fiscal</DialogTitle>
            <DialogDescription>Informe o motivo do cancelamento (min. 15 caracteres)</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Motivo</Label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>Voltar</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelReason.length < 15 || cancelMutation.isPending}>
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Correction Dialog */}
      <Dialog open={showCorrectionDialog} onOpenChange={setShowCorrectionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Carta de Correcao</DialogTitle>
            <DialogDescription>Descreva a correcao necessaria (min. 15 caracteres)</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Correcao</Label>
            <Textarea value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCorrectionDialog(false)}>Voltar</Button>
            <Button onClick={handleCorrection} disabled={correctionReason.length < 15 || correctionMutation.isPending}>
              Enviar Correcao
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar NF-e por Email</DialogTitle>
            <DialogDescription>Informe o email do destinatario</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              placeholder="email@exemplo.com"
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleSendEmail}
              disabled={!emailAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress) || sendEmailMutation.isPending}
            >
              <Mail className="mr-2 h-4 w-4" />
              {sendEmailMutation.isPending ? "Enviando..." : "Enviar Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
