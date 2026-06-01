"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Copy, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface BalanceHeroProps {
  depixBalance: number;
  lbtcSat: number;
  masterAddress: string | null;
  network: string | null;
  success: boolean;
  error: string | null;
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
export function BalanceHero({
  depixBalance,
  lbtcSat,
  masterAddress,
  network,
  success,
  error,
  className,
}: BalanceHeroProps) {
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
              <p className="text-4xl sm:text-5xl font-mono font-bold tabular-nums text-foreground">
                {success ? formatBRL(depixBalance) : "—"}
              </p>
            </div>
            {!success && error && (
              <p className="text-xs text-destructive mt-1.5">{error}</p>
            )}
            <p className="text-[11px] text-muted-foreground mt-2 inline-flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Rede {network ?? "Liquid"} · L-BTC {lbtcSat} sat
            </p>
          </div>

          <div className="flex gap-2 shrink-0">
            <Button asChild size="lg" className="shadow-sm">
              <Link href="/depix-wallet/receive">
                <ArrowDownLeft className="mr-2 h-4 w-4" />
                Receber
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/depix-wallet/withdraw">
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Sacar
              </Link>
            </Button>
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
