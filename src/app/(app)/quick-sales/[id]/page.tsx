"use client";

import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CreditCard,
  CheckCircle,
  XCircle,
  User,
  Calendar,
  Loader2,
  Printer,
  QrCode,
} from "lucide-react";
import { QuickSaleDepixDialog } from "./_components/quick-sale-depix-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { QUICK_SALE_STATUS_LABELS } from "@/lib/validators/quick-sale";
import { toast } from "@/lib/toast";
import { useState } from "react";

const STATUS_COLORS: Record<string, string> = {
  AWAITING_PAYMENT: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  PAID: "bg-green-500/10 text-green-500 border-green-500/20",
  CANCELLED: "bg-red-500/10 text-red-500 border-red-500/20",
  REFUNDED: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function QuickSaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: sale, isLoading } = useQuery(
    trpc.quickSale.getById.queryOptions({ id })
  );

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  // Abre auto quando vem do /new (?showPix=1).
  const [showPixDialog, setShowPixDialog] = useState(
    searchParams.get("showPix") === "1",
  );

  const markPaidMutation = useMutation(
    trpc.quickSale.markPaid.mutationOptions({
      onSuccess: () => {
        toast.success("Pagamento confirmado!");
        queryClient.invalidateQueries({ queryKey: [["quickSale"]] });
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const cancelMutation = useMutation(
    trpc.quickSale.cancel.mutationOptions({
      onSuccess: () => {
        toast.success("Venda cancelada");
        queryClient.invalidateQueries({ queryKey: [["quickSale"]] });
        setShowCancelConfirm(false);
      },
      onError: (err) => toast.error(err.message),
    })
  );

  if (isLoading) return <LoadingState />;
  if (!sale) return <div className="text-center py-12 text-muted-foreground">Venda nao encontrada</div>;

  const s = sale as any;
  const status = s.status as string;
  const isAwaiting = status === "AWAITING_PAYMENT";
  const isPaid = status === "PAID";

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild aria-label="Voltar para lista de vendas rapidas">
              <Link href="/quick-sales"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <CreditCard className="h-5 w-5 text-primary" />
            <span>Venda #{s.number as string}</span>
            <Badge variant="outline" className={STATUS_COLORS[status] ?? ""}>
              {QUICK_SALE_STATUS_LABELS[status] ?? status}
            </Badge>
          </div>
        }
        actions={
          <div className="flex gap-2">
            {isAwaiting && (
              <>
                <Button onClick={() => setShowPixDialog(true)}>
                  <QrCode className="mr-2 h-4 w-4" />
                  {s.walletTransactionId || s.depixTransactionId ? "Ver QR PIX" : "Gerar PIX DePix"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => markPaidMutation.mutate({ id })}
                  disabled={markPaidMutation.isPending}
                  title="Marcar como pago manualmente (PIX recebido fora do app)"
                >
                  {markPaidMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Marcar Pago Manual
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive border-destructive/30"
                  onClick={() => setShowCancelConfirm(true)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
              </>
            )}
            {isPaid && (
              <>
                <Button variant="outline" disabled className="opacity-60">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Pagamento Confirmado
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open(`/api/quick-sales/${id}/recibo`, "_blank")}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Recibo
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Payer data */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4" /> Dados do Pagador
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nome</span>
              <span className="font-medium">{String(s.buyerName ?? "-")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">CPF/CNPJ</span>
              <span className="font-mono">{String(s.cpfCnpj ?? "-")}</span>
            </div>
            {s.phone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Telefone</span>
                <span>{String(s.phone)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Values */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantidade</span>
              <span>{s.quantity as number}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor Unitario</span>
              <span>{formatCurrency(s.unitPrice as number)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency((s.quantity as number) * (s.unitPrice as number))}</span>
            </div>
            {(s.discount as number) > 0 && (
              <div className="flex justify-between text-green-500">
                <span>Desconto</span>
                <span>- {formatCurrency(s.discount as number)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(s.totalAmount as number)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Registro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Criado em</span>
              <span>{new Date(s.createdAt as string).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            {s.paidAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pago em</span>
                <span>{new Date(s.paidAt as string).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product description */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Descricao do Produto/Servico</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="whitespace-pre-wrap text-sm bg-muted/50 p-4 rounded-lg border">
            {String(s.productDescription)}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="Cancelar venda?"
        description="Essa acao nao pode ser desfeita."
        confirmLabel="Cancelar Venda"
        variant="destructive"
        isLoading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate({ id })}
      />

      {showPixDialog && (
        <QuickSaleDepixDialog
          open={showPixDialog}
          quickSaleId={id}
          totalCents={s.totalAmount as number}
          buyerTaxId={s.cpfCnpj as string | null}
          existingWalletTransactionId={s.walletTransactionId as string | null}
          existingTransactionId={s.depixTransactionId as string | null}
          existingQrCode={s.depixQrCode as string | null}
          existingQrCodeBase64={s.depixQrCodeBase64 as string | null}
          onClose={() => {
            setShowPixDialog(false);
            // Limpa o ?showPix=1 da URL para nao reabrir em refresh.
            if (searchParams.get("showPix")) router.replace(`/quick-sales/${id}`);
          }}
          onPaid={() => {
            setShowPixDialog(false);
            if (searchParams.get("showPix")) router.replace(`/quick-sales/${id}`);
            queryClient.invalidateQueries({ queryKey: [["quickSale"]] });
          }}
        />
      )}
    </div>
  );
}
