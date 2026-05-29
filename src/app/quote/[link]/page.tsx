"use client";

import { use, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";

function formatMoney(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function QuoteApprovalPage({
  params,
}: {
  params: Promise<{ link: string }>;
}) {
  const { link } = use(params);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [customerNotes, setCustomerNotes] = useState("");

  const quoteQuery = useQuery(
    trpc.serviceOrder.getQuoteByLink.queryOptions({ link })
  );
  const isLoading = quoteQuery.isLoading;
  const error = quoteQuery.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quote = quoteQuery.data as any;

  const respondMut = useMutation(
    trpc.serviceOrder.respondToQuote.mutationOptions({
      onSuccess: (result) => {
        toast.success(result.action === "approve" ? "Orcamento aprovado!" : "Orcamento rejeitado.");
        void queryClient.invalidateQueries();
      },
      onError: (err) => toast.error(err.message),
    })
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 to-purple-700 flex items-center justify-center">
        <div className="text-white/70 animate-pulse">Carregando...</div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 to-purple-700 flex items-center justify-center p-4">
        <div className="bg-white/95 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <FileText className="h-16 w-16 text-purple-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Orcamento nao encontrado</h1>
          <p className="text-gray-600">O link pode estar incorreto ou o orcamento foi removido.</p>
        </div>
      </div>
    );
  }

  const isPending = quote.status === "pending";
  const isApproved = quote.status === "approved";
  const difference = quote.newTotal - quote.previousTotal;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 to-purple-700 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8 max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 mb-4">
            <FileText className="h-8 w-8 text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Aprovacao de Orcamento</h1>
          <p className="text-gray-600 mt-1">OS #{quote.orderNumber}</p>
        </div>

        {/* Status Badge (if already processed) */}
        {!isPending && (
          <div className={`text-center mb-6 p-4 rounded-lg ${isApproved ? "bg-green-100" : "bg-red-100"}`}>
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold text-lg text-white ${isApproved ? "bg-green-500" : "bg-red-500"}`}>
              {isApproved ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
              {isApproved ? "Aprovado" : "Rejeitado"}
            </span>
          </div>
        )}

        {/* Customer & Equipment */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-600">Cliente</p>
          <p className="font-semibold text-gray-800">{quote.customerName}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-600">Equipamento</p>
          <p className="font-semibold text-gray-800">
            {[quote.deviceType, quote.deviceModel].filter(Boolean).join(" — ") || "—"}
          </p>
        </div>

        {/* Reason */}
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg mb-6">
          <h3 className="font-bold text-gray-800 mb-1">Motivo da Alteracao</h3>
          <p className="text-gray-700 text-sm">{quote.reason}</p>
          {quote.additionalServices && (
            <div className="mt-2">
              <p className="text-sm font-semibold text-gray-600">Servicos Adicionais:</p>
              <p className="text-gray-700 text-sm">{quote.additionalServices}</p>
            </div>
          )}
        </div>

        {/* Itemized new budget */}
        {Array.isArray(quote.newItemsSnapshot) && quote.newItemsSnapshot.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <h3 className="font-bold text-gray-800 mb-2">Itens do Orcamento</h3>
            <div className="space-y-1">
              {(quote.newItemsSnapshot as Array<{ description: string; quantity: number; unitPrice: number; total: number }>).map((it, idx) => (
                <div key={idx} className="flex justify-between text-sm text-gray-700">
                  <span>{it.quantity}x {it.description}</span>
                  <span className="font-mono">{formatMoney(it.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Values Comparison */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-gray-100 rounded-lg p-4 text-center">
            <p className="text-sm text-gray-600">Valor Anterior</p>
            <p className="text-2xl font-bold text-gray-800">{formatMoney(quote.previousTotal)}</p>
          </div>
          <div className="bg-purple-100 rounded-lg p-4 text-center">
            <p className="text-sm text-purple-600">Novo Valor</p>
            <p className="text-2xl font-bold text-purple-700">{formatMoney(quote.newTotal)}</p>
          </div>
        </div>

        {/* Difference */}
        <div className={`text-center p-3 rounded-lg mb-6 ${difference > 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          <p className="text-sm font-medium">
            Diferenca: {difference > 0 ? "+" : ""}{formatMoney(difference)}
          </p>
        </div>

        {/* Actions (only if pending) */}
        {isPending && (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-700">Observacao (opcional)</Label>
              <Textarea
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Deixe uma observacao..."
                rows={2}
                className="mt-1"
              />
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                onClick={() => respondMut.mutate({ link, action: "approve", customerNotes: customerNotes || null })}
                disabled={respondMut.isPending}
              >
                <Check className="mr-2 h-4 w-4" />Aprovar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => respondMut.mutate({ link, action: "reject", customerNotes: customerNotes || null })}
                disabled={respondMut.isPending}
              >
                <X className="mr-2 h-4 w-4" />Rejeitar
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-gray-400">
          {quote.tenantName}
        </div>
      </div>
    </div>
  );
}
