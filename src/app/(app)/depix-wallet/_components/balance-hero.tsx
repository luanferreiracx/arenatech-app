"use client";

import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Copy, Link2, Send, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GenerateLinkDialog } from "./generate-link-dialog";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface BalanceHeroProps {
  depixBalance: number;
  masterAddress: string | null;
  network: string | null;
  success: boolean;
  error: string | null;
  canWithdraw: boolean;
  /** true = sincronização degradada; o saldo pode não refletir a realidade on-chain. */
  stale?: boolean;
  /** ISO do último sync bem-sucedido do LWK (exibe "atualizado há X"). */
  lastSyncOkAt?: string | null;
  className?: string;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Card-hero do saldo. Gradiente sutil dourado, borda dourada inferior fina,
 * saldo em fonte mono grande e tabular-nums. Acoes Receber/Sacar como
 * botoes primarios + endereco de recebimento com copy abaixo.
 */
function formatRelativeSync(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (diffMin < 1) return "há instantes";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;
  return `há ${Math.round(diffH / 24)} d`;
}

export function BalanceHero({
  depixBalance,
  masterAddress,
  network,
  success,
  error,
  canWithdraw,
  stale = false,
  lastSyncOkAt = null,
  className,
}: BalanceHeroProps) {
  const relativeSync = formatRelativeSync(lastSyncOkAt);
  return (
    <Card
      className={cn(
        "relative overflow-hidden p-6 sm:p-7",
        "bg-linear-to-br from-card via-card to-primary/[0.04]",
        "border-b-2 border-b-primary/30",
        className,
      )}
    >
      {/* glow decorativo no canto */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl"
      />

      <div className="relative flex flex-col gap-6">
        {/* topo */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
                Saldo disponivel
              </p>
            </div>
            <div className="flex items-baseline gap-2">
              <p
                className={cn(
                  "text-4xl sm:text-5xl font-mono font-bold tabular-nums",
                  success && stale ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {success ? formatBRL(depixBalance) : "—"}
              </p>
            </div>
            {!success && error && (
              <p className="text-xs text-destructive mt-1.5">{error}</p>
            )}
            {success && stale && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <p className="text-xs text-warning-foreground">
                  Saldo pode estar desatualizado — a sincronizacao com a rede esta
                  degradada
                  {relativeSync ? ` (ultima atualizacao ${relativeSync})` : ""}.
                </p>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-2 inline-flex items-center gap-2">
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full",
                  stale ? "bg-warning" : "bg-success animate-pulse",
                )}
              />
              Rede {network ?? "Liquid"}
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <div className="flex gap-2">
              <Button asChild size="lg" className="shadow-sm">
                <Link href="/depix-wallet/receive">
                  <ArrowDownLeft className="mr-2 h-4 w-4" />
                  Receber
                </Link>
              </Button>
              {canWithdraw && (
                <Button asChild size="lg" variant="outline">
                  <Link href="/depix-wallet/withdraw">
                    <ArrowUpRight className="mr-2 h-4 w-4" />
                    Sacar
                  </Link>
                </Button>
              )}
              {canWithdraw && (
                <Button asChild size="lg" variant="outline">
                  <Link href="/depix-wallet/withdraw-onchain">
                    <Send className="mr-2 h-4 w-4" />
                    Enviar on-chain
                  </Link>
                </Button>
              )}
              {/* Conversão DePix→USDT (Sideswap) DESATIVADA: a assinatura do PSET
                  de swap não é suportada pelo LWK 0.17 (o Sideswap rejeita).
                  Código mantido, mas inacessível até resolver (ver memória). */}
              <GenerateLinkDialog
                trigger={
                  <Button size="lg" variant="outline">
                    <Link2 className="mr-2 h-4 w-4" />
                    Gerar link
                  </Button>
                }
              />
            </div>
            {!canWithdraw && (
              <p className="max-w-[240px] text-xs text-muted-foreground text-left sm:text-right">
                Saque disponivel apenas para perfil admin do tenant.
              </p>
            )}
          </div>
        </div>

        {/* endereco */}
        {masterAddress && (
          <div className="pt-4 border-t border-border/60">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1.5 font-medium">
              Endereco de recebimento (Liquid)
            </p>
            <div className="flex items-start gap-2">
              <p className="font-mono text-[11px] leading-relaxed break-all flex-1 select-all text-foreground/85">
                {masterAddress}
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(masterAddress);
                  toast.success("Endereco copiado!");
                }}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-muted hover:bg-muted/70 transition-colors font-medium"
              >
                <Copy className="h-3 w-3" /> Copiar
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
