"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ShoppingBag,
  XCircle,
  PenLine,
  CheckCircle2,
  ExternalLink,
  Copy,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/domain/status-badge";
import { LoadingState } from "@/components/domain/loading-state";
import { WhatsappRecipientPicker, type PhoneOption } from "@/components/domain/whatsapp-recipient-picker";
import { toast } from "@/lib/toast";
import { deviceConditionLabels } from "@/lib/validators/stock";

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(d: string | Date | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PurchaseDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const detailQuery = useQuery(trpc.stock.getPurchaseById.queryOptions({ id }));
  const purchase = detailQuery.data as Record<string, unknown> | undefined;

  const isCancelled = !!(purchase?.cancelledAt);
  const isTermSigned = !!purchase?.termSigned;
  const hasAutentique = !!purchase?.autentiqueDocumentId;
  const isAutentiquePending = hasAutentique && !isTermSigned;

  // Polling Autentique a cada 10s enquanto pendente.
  const checkStatusMutation = useMutation(
    trpc.stock.checkPurchaseSignatureStatus.mutationOptions({
      onSuccess: (res) => {
        if (res.signed) {
          queryClient.invalidateQueries({ queryKey: trpc.stock.getPurchaseById.queryKey({ id }) });
        }
      },
    }),
  );

  useEffect(() => {
    if (!isAutentiquePending) return;
    const interval = setInterval(() => {
      checkStatusMutation.mutate({ id });
    }, 10_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutentiquePending, id]);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showPhysicalDialog, setShowPhysicalDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [signaturePhone, setSignaturePhone] = useState("");

  const cancelMutation = useMutation(
    trpc.stock.cancelPurchase.mutationOptions({
      onSuccess: () => {
        toast.success("Compra cancelada");
        queryClient.invalidateQueries({ queryKey: trpc.stock.getPurchaseById.queryKey({ id }) });
        setShowCancelDialog(false);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const sendTermMutation = useMutation(
    trpc.stock.sendPurchaseTermAutentique.mutationOptions({
      onSuccess: () => {
        toast.success("Termo enviado para Autentique");
        queryClient.invalidateQueries({ queryKey: trpc.stock.getPurchaseById.queryKey({ id }) });
        setShowSendDialog(false);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const confirmPhysicalMutation = useMutation(
    trpc.stock.confirmPurchasePhysicalSignature.mutationOptions({
      onSuccess: () => {
        toast.success("Assinatura fisica confirmada");
        queryClient.invalidateQueries({ queryKey: trpc.stock.getPurchaseById.queryKey({ id }) });
        setShowPhysicalDialog(false);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (detailQuery.isLoading) return <LoadingState />;
  if (!purchase) {
    return <div className="text-center py-12 text-muted-foreground">Compra nao encontrada</div>;
  }

  const conditionLabel =
    deviceConditionLabels[purchase.condition as string] ?? (purchase.condition as string);
  const purchasePrice = purchase.purchasePrice as number;
  const salePrice = purchase.salePrice as number | null;
  const autentiqueLink = purchase.autentiqueLink as string | null;

  return (
    <div>
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/stock/purchases">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <ShoppingBag className="h-5 w-5 text-primary" />
            <span>Compra {(purchase.id as string).slice(0, 8)}</span>
            {isCancelled ? (
              <StatusBadge variant="destructive">Cancelada</StatusBadge>
            ) : isTermSigned ? (
              <StatusBadge variant="success">Termo assinado</StatusBadge>
            ) : (
              <StatusBadge variant="warning">Termo pendente</StatusBadge>
            )}
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {!isCancelled && (
              <>
                <Button variant="outline" asChild>
                  <a
                    href={`/api/purchases/${id}/termo-responsabilidade`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <PenLine className="mr-2 h-4 w-4" />
                    Ver termo
                  </a>
                </Button>
                {!isTermSigned && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSignaturePhone("");
                      setShowSendDialog(true);
                    }}
                  >
                    <PenLine className="mr-2 h-4 w-4" />
                    {hasAutentique ? "Reenviar termo" : "Enviar termo"}
                  </Button>
                )}
                {!isTermSigned && (
                  <Button variant="outline" onClick={() => setShowPhysicalDialog(true)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Assinatura fisica
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="text-destructive border-destructive/30"
                  onClick={() => setShowCancelDialog(true)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Aparelho</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Marca/Modelo</span>
              <span className="font-medium text-right">
                {[purchase.brand, purchase.model].filter(Boolean).join(" ") || "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Condicao</span>
              <span>{conditionLabel}</span>
            </div>
            {(purchase.imei as string | null) && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IMEI</span>
                <span className="font-mono text-xs">{purchase.imei as string}</span>
              </div>
            )}
            {(purchase.serial as string | null) && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Serie</span>
                <span className="font-mono text-xs">{purchase.serial as string}</span>
              </div>
            )}
            {(purchase.batteryHealth as number | null) != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bateria</span>
                <span>{purchase.batteryHealth as number}%</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Valores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor de compra</span>
              <span className="font-medium tabular-nums">{formatCurrency(purchasePrice)}</span>
            </div>
            {salePrice != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Preco sugerido de venda</span>
                <span className="tabular-nums">{formatCurrency(salePrice)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-muted-foreground border-t pt-2 mt-2">
              <span>Comprado em</span>
              <span>{formatDate(purchase.purchaseDate as string)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Termo de responsabilidade</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {isTermSigned ? (
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {purchase.termSignedVia === "physical"
                    ? "Assinado fisicamente"
                    : "Assinado via Autentique"}
                  {(purchase.termSignedAt as string | null) && (
                    <span className="block text-xs text-muted-foreground">
                      em {formatDate(purchase.termSignedAt as string)}
                    </span>
                  )}
                </span>
              </div>
            ) : isAutentiquePending ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-yellow-500">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
                  </span>
                  Aguardando assinatura...
                </div>
                {(purchase.autentiqueSentAt as string | null) && (
                  <p className="text-xs text-muted-foreground">
                    Enviado em {formatDate(purchase.autentiqueSentAt as string)}
                  </p>
                )}
                {autentiqueLink && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={autentiqueLink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-3 w-3" />
                        Abrir
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(autentiqueLink);
                        toast.success("Link copiado");
                      }}
                    >
                      <Copy className="mr-2 h-3 w-3" />
                      Copiar
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground italic">Termo nao enviado nem assinado.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {(purchase.notes as string | null) && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Observacoes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {purchase.notes as string}
          </CardContent>
        </Card>
      )}

      {isCancelled && (purchase.cancellationReason as string | null) && (
        <Card className="mt-4 border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive">Cancelamento</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{purchase.cancellationReason as string}</p>
            <p className="text-xs text-muted-foreground mt-1">
              em {formatDate(purchase.cancelledAt as string)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Cancel dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar compra</DialogTitle>
            <DialogDescription>
              A compra sera cancelada e o aparelho removido do estoque (quando aplicavel).
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Motivo do cancelamento *</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Informe o motivo..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (cancelReason.trim().length < 3) {
                  toast.error("Motivo deve ter ao menos 3 caracteres");
                  return;
                }
                cancelMutation.mutate({ id, reason: cancelReason });
              }}
              disabled={cancelMutation.isPending}
            >
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send term Autentique dialog (paridade PDV sale.sendForSignature) */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar termo para assinatura digital</DialogTitle>
            <DialogDescription>
              Cria o documento no Autentique e envia o link de assinatura por WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <WhatsappRecipientPicker
            options={(purchase.sellerPhones ?? []) as PhoneOption[]}
            value={signaturePhone}
            onValueChange={setSignaturePhone}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                sendTermMutation.mutate({
                  id,
                  whatsappOverride: signaturePhone.trim() || undefined,
                })
              }
              disabled={sendTermMutation.isPending}
            >
              {sendTermMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PenLine className="mr-2 h-4 w-4" />
              )}
              {hasAutentique ? "Reenviar" : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm physical signature dialog */}
      <Dialog open={showPhysicalDialog} onOpenChange={setShowPhysicalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar assinatura fisica</DialogTitle>
            <DialogDescription>
              Marca o termo como assinado no papel. Use quando o cliente
              assinou presencialmente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPhysicalDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => confirmPhysicalMutation.mutate({ id })}
              disabled={confirmPhysicalMutation.isPending}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
