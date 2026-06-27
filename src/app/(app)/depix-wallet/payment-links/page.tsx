"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Link2, XCircle, Loader2, ExternalLink } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { GenerateLinkDialog } from "../_components/generate-link-dialog";
import { toast } from "@/lib/toast";

function formatBRL(cents: number | null): string {
  if (cents == null) return "Valor livre";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type StatusMeta = { label: string; className: string };
const STATUS_META: Record<string, StatusMeta> = {
  ACTIVE: { label: "Ativo", className: "bg-primary/10 text-primary border-primary/20" },
  PAID: { label: "Pago", className: "bg-success/10 text-success border-success/20" },
  EXPIRED: { label: "Expirado", className: "bg-muted text-muted-foreground border-border" },
  CANCELLED: { label: "Cancelado", className: "bg-destructive/10 text-destructive border-destructive/20" },
};
const FALLBACK_META: StatusMeta = STATUS_META.ACTIVE!;

export default function PaymentLinksPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const linksQuery = useQuery(trpc.paymentLink.list.queryOptions({ limit: 50 }));

  const cancelMutation = useMutation(
    trpc.paymentLink.cancel.mutationOptions({
      onSuccess: () => {
        toast.success("Link cancelado");
        void queryClient.invalidateQueries({ queryKey: [["paymentLink"]] });
      },
      onError: (err) => toast.error(err.message),
      onSettled: () => setCancelId(null),
    }),
  );

  function copy(id: string, url: string) {
    void navigator.clipboard.writeText(url);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
  }

  const links = linksQuery.data ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8" aria-label="Voltar">
              <Link href="/depix-wallet">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <span>Links de pagamento</span>
          </div>
        }
        subtitle="Cobranças geradas para clientes pagarem por link"
        actions={
          <GenerateLinkDialog
            trigger={
              <Button>
                <Link2 className="mr-2 h-4 w-4" />
                Novo link
              </Button>
            }
          />
        }
      />

      {linksQuery.isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : links.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <div className="grid size-12 place-content-center rounded-full bg-primary/10 text-primary">
            <Link2 className="h-5 w-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            Nenhum link de pagamento ainda. Gere um para cobrar um cliente por link.
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {links.map((link) => {
            const meta = STATUS_META[link.status] ?? FALLBACK_META;
            const isActive = link.status === "ACTIVE";
            return (
              <Card key={link.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{formatBRL(link.amountCents)}</span>
                    <Badge variant="outline" className={meta.className}>
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {link.description || "Sem descrição"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Criado em {formatDate(link.createdAt)}
                    {isActive && link.expiresAt && ` · expira em ${formatDate(link.expiresAt)}`}
                    {link.status === "PAID" && link.paidAt && ` · pago em ${formatDate(link.paidAt)}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copy(link.id, link.url)}
                    title="Copiar link"
                  >
                    {copiedId === link.id ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    <span className="ml-1.5 hidden sm:inline">Copiar</span>
                  </Button>
                  <Button asChild size="sm" variant="ghost" title="Abrir link">
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  {isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setCancelId(link.id)}
                      title="Cancelar link"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={cancelId !== null}
        onOpenChange={(v) => !v && setCancelId(null)}
        title="Cancelar link de pagamento?"
        description="O link deixará de aceitar pagamentos. Esta ação não pode ser desfeita."
        confirmLabel="Cancelar link"
        variant="destructive"
        isLoading={cancelMutation.isPending}
        onConfirm={() => {
          if (cancelId) cancelMutation.mutate({ id: cancelId });
        }}
      />
    </div>
  );
}
