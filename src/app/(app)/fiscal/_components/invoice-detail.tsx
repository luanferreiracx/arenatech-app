"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileCheck,
  Ban,
  FileText,
  Download,
  FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { LoadingState } from "@/components/domain/loading-state";
import { PageHeader } from "@/components/domain/page-header";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  invoiceTypeLabels,
  invoiceStatusLabels,
} from "@/lib/validators/fiscal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getStatusVariant(status: string) {
  const map: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
    DRAFT: "default",
    PENDING: "warning",
    AUTHORIZED: "success",
    CANCELLED: "destructive",
    REJECTED: "destructive",
    CORRECTION_LETTER: "info",
  };
  return map[status] ?? "default";
}

interface InvoiceDetailProps {
  id: string;
}

export function InvoiceDetail({ id }: InvoiceDetailProps) {
  const trpc = useTRPC();
  const [showAuthorize, setShowAuthorize] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");

  const { data: invoice, isLoading, refetch } = useQuery(
    trpc.fiscal.getById.queryOptions({ id }),
  );

  const authorizeMutation = useMutation(
    trpc.fiscal.authorize.mutationOptions({
      onSuccess: () => {
        toast.success("Nota fiscal autorizada com sucesso!");
        void refetch();
        setShowAuthorize(false);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const cancelMutation = useMutation(
    trpc.fiscal.cancel.mutationOptions({
      onSuccess: () => {
        toast.success("Nota fiscal cancelada");
        void refetch();
        setShowCancel(false);
        setCancelReason("");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const correctionMutation = useMutation(
    trpc.fiscal.correctionLetter.mutationOptions({
      onSuccess: () => {
        toast.success("Carta de correção enviada");
        void refetch();
        setShowCorrection(false);
        setCorrectionReason("");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const { data: pdfData } = useQuery(
    trpc.fiscal.downloadPdf.queryOptions(
      { id },
      { enabled: invoice?.status === "AUTHORIZED" || invoice?.status === "CORRECTION_LETTER" },
    ),
  );

  const { data: xmlData } = useQuery(
    trpc.fiscal.downloadXml.queryOptions(
      { id },
      { enabled: invoice?.status === "AUTHORIZED" || invoice?.status === "CORRECTION_LETTER" },
    ),
  );

  if (isLoading) return <LoadingState variant="card" />;
  if (!invoice) return <div className="text-center py-8 text-muted-foreground">Nota fiscal não encontrada</div>;

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/fiscal">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <span>
              {invoiceTypeLabels[invoice.type] ?? invoice.type}{" "}
              {invoice.number ? `#${invoice.number}/${invoice.series ?? 1}` : "(Rascunho)"}
            </span>
          </div>
        }
        subtitle={`Status: ${invoiceStatusLabels[invoice.status] ?? invoice.status}`}
        actions={
          <div className="flex gap-2">
            {invoice.status === "DRAFT" && (
              <Button size="sm" onClick={() => setShowAuthorize(true)}>
                <FileCheck className="h-4 w-4 mr-1" />
                Autorizar
              </Button>
            )}
            {invoice.status === "AUTHORIZED" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCorrection(true)}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Carta Correção
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowCancel(true)}
                >
                  <Ban className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
              </>
            )}
            {pdfData?.url && (
              <Button size="sm" variant="outline" asChild>
                <a href={pdfData.url} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4 mr-1" />
                  DANFE
                </a>
              </Button>
            )}
            {xmlData?.url && (
              <Button size="sm" variant="outline" asChild>
                <a href={xmlData.url} target="_blank" rel="noopener noreferrer">
                  <FileCode className="h-4 w-4 mr-1" />
                  XML
                </a>
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da Nota</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <span>{invoiceTypeLabels[invoice.type]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge variant={getStatusVariant(invoice.status)}>
                {invoiceStatusLabels[invoice.status] ?? invoice.status}
              </StatusBadge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor Total</span>
              <span className="font-bold">{formatMoney(invoice.totalAmount)}</span>
            </div>
            {invoice.number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Número</span>
                <span>{invoice.number}/{invoice.series ?? 1}</span>
              </div>
            )}
            {invoice.accessKey && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Chave de Acesso</span>
                <span className="text-xs font-mono break-all max-w-[200px] text-right">
                  {invoice.accessKey}
                </span>
              </div>
            )}
            {invoice.referenceType && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Referência</span>
                <span className="capitalize">{invoice.referenceType.replace("_", " ")}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Criado em</span>
              <span>{new Date(invoice.createdAt).toLocaleString("pt-BR")}</span>
            </div>
            {invoice.authorizedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Autorizado em</span>
                <span>{new Date(invoice.authorizedAt).toLocaleString("pt-BR")}</span>
              </div>
            )}
            {invoice.cancelledAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cancelado em</span>
                <span>{new Date(invoice.cancelledAt).toLocaleString("pt-BR")}</span>
              </div>
            )}
            {invoice.correctionReason && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Correção</span>
                <span className="max-w-[200px] text-right">{invoice.correctionReason}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recipient Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Destinatário</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nome</span>
              <span>{invoice.recipientName ?? "Não informado"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">CPF/CNPJ</span>
              <span>{invoice.recipientCpfCnpj ?? "Não informado"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens ({invoice.items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Valor Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>NCM</TableHead>
                <TableHead>CFOP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right">{Number(item.quantity)}</TableCell>
                  <TableCell className="text-right">{formatMoney(item.unitPrice)}</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(item.total)}</TableCell>
                  <TableCell>{item.ncm ?? "—"}</TableCell>
                  <TableCell>{item.cfop ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Authorize Dialog */}
      <ConfirmDialog
        open={showAuthorize}
        onOpenChange={setShowAuthorize}
        title="Autorizar Nota Fiscal"
        description="Deseja enviar esta nota fiscal para autorização na SEFAZ? Esta ação não pode ser desfeita."
        onConfirm={() => authorizeMutation.mutate({ id })}
        isLoading={authorizeMutation.isPending}
      />

      {/* Cancel Dialog */}
      <Dialog open={showCancel} onOpenChange={setShowCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Nota Fiscal</DialogTitle>
            <DialogDescription>
              Informe o motivo do cancelamento (mínimo 15 caracteres).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Justificativa</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo do cancelamento..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancel(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={cancelReason.length < 15 || cancelMutation.isPending}
              onClick={() => cancelMutation.mutate({ id, reason: cancelReason })}
            >
              {cancelMutation.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Correction Letter Dialog */}
      <Dialog open={showCorrection} onOpenChange={setShowCorrection}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Carta de Correção</DialogTitle>
            <DialogDescription>
              Informe o texto da correção (mínimo 15 caracteres).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Correção</Label>
            <Textarea
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="Texto da carta de correção..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCorrection(false)}>
              Voltar
            </Button>
            <Button
              disabled={correctionReason.length < 15 || correctionMutation.isPending}
              onClick={() => correctionMutation.mutate({ id, reason: correctionReason })}
            >
              {correctionMutation.isPending ? "Enviando..." : "Enviar Carta de Correção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
