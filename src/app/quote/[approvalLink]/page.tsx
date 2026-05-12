"use client";

import { useState, use } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2 } from "lucide-react";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR");
}

export default function QuotePublicPage({ params }: { params: Promise<{ approvalLink: string }> }) {
  const { approvalLink } = use(params);
  const trpc = useTRPC();
  const [notes, setNotes] = useState("");

  const { data: quote, isLoading, refetch } = useQuery(
    trpc.serviceOrders.getQuotePublic.queryOptions({ approvalLink }),
  );

  const approveMutation = useMutation(
    trpc.serviceOrders.aprovarOrcamentoPublico.mutationOptions({
      onSuccess: () => void refetch(),
    }),
  );

  const rejectMutation = useMutation(
    trpc.serviceOrders.rejeitarOrcamentoPublico.mutationOptions({
      onSuccess: () => void refetch(),
    }),
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <X className="mx-auto h-12 w-12 text-destructive mb-4" />
            <h2 className="text-lg font-semibold">Orcamento nao encontrado</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Este link pode ter expirado ou ja ter sido processado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const diff = quote.newTotal - quote.previousTotal;
  const isPending = quote.status === "pending";

  return (
    <div className="min-h-screen bg-zinc-950 p-4 flex items-start justify-center pt-8">
      <div className="w-full max-w-lg space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-zinc-100">ARENA TECH</h1>
          <p className="text-sm text-zinc-400">Orcamento Adicional</p>
        </div>

        {/* Status */}
        {!isPending && (
          <Card>
            <CardContent className="pt-6 text-center">
              {quote.status === "approved" ? (
                <>
                  <Check className="mx-auto h-12 w-12 text-green-500 mb-2" />
                  <h2 className="text-lg font-semibold text-green-500">Orcamento Aprovado</h2>
                  <p className="text-sm text-muted-foreground">Obrigado! Daremos andamento ao servico.</p>
                </>
              ) : (
                <>
                  <X className="mx-auto h-12 w-12 text-red-500 mb-2" />
                  <h2 className="text-lg font-semibold text-red-500">Orcamento Rejeitado</h2>
                  <p className="text-sm text-muted-foreground">Entraremos em contato para os proximos passos.</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Order info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              OS #{quote.orderNumber}
              <Badge variant="outline">{quote.deviceType} {quote.deviceModel}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente</span>
              <span>{quote.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data</span>
              <span>{formatDate(quote.createdAt)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Values */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Valores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor Original</span>
              <span className="font-mono">{formatMoney(quote.previousTotal)}</span>
            </div>
            <div className="border-t pt-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Novo - Servicos</span>
                <span className="font-mono">{formatMoney(quote.newServiceAmount)}</span>
              </div>
              {quote.newPartsAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Novo - Pecas</span>
                  <span className="font-mono">{formatMoney(quote.newPartsAmount)}</span>
                </div>
              )}
              {quote.newDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Desconto</span>
                  <span className="font-mono">-{formatMoney(quote.newDiscount)}</span>
                </div>
              )}
            </div>
            <div className="border-t pt-3">
              <div className="flex justify-between font-semibold text-base">
                <span>Novo Total</span>
                <span className="font-mono text-purple-500">{formatMoney(quote.newTotal)}</span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-muted-foreground">Diferenca</span>
                <span className={`font-mono ${diff > 0 ? "text-red-500" : "text-green-500"}`}>
                  {diff > 0 ? "+" : ""}{formatMoney(diff)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reason */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Motivo</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="whitespace-pre-line">{quote.reason}</p>
            {quote.additionalServices && (
              <div className="mt-3 pt-3 border-t">
                <p className="font-medium text-muted-foreground mb-1">Servicos Adicionais</p>
                <p className="whitespace-pre-line">{quote.additionalServices}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        {isPending && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label>Observacoes (opcional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Alguma observacao sobre o orcamento..."
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  variant="destructive"
                  disabled={rejectMutation.isPending || approveMutation.isPending}
                  onClick={() => rejectMutation.mutate({ approvalLink, notes: notes || undefined })}
                >
                  {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
                  Rejeitar
                </Button>
                <Button
                  className="flex-1"
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  onClick={() => approveMutation.mutate({ approvalLink, notes: notes || undefined })}
                >
                  {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  Aprovar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
