"use client";

import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Money } from "@/components/domain/money";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Gift, Loader2, AlertTriangle } from "lucide-react";

const REWARD_TYPE_LABELS: Record<string, string> = {
  DISCOUNT_PERCENTAGE: "Desconto %",
  DISCOUNT_FIXED: "Desconto R$",
  CASHBACK: "Cashback",
  GIFT: "Brinde",
};

/**
 * Resgate de recompensa de fidelidade na venda. Lista as recompensas APROVADAS do
 * cliente e aplica a escolhida (consome a recompensa + grava o desconto).
 *
 * Decisão do dono: a recompensa SUBSTITUI o desconto manual (a venda tem um único
 * slot de desconto) — avisamos quando já existe desconto aplicado.
 */
export function RewardRedeemDialog({
  open,
  onOpenChange,
  saleId,
  customerId,
  hasManualDiscount,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  customerId: string | undefined;
  hasManualDiscount: boolean;
  onApplied: () => void;
}) {
  const trpc = useTRPC();

  const rewardsQuery = useQuery(
    trpc.reward.getAvailableRewards.queryOptions(
      { customerId: customerId ?? "" },
      { enabled: open && !!customerId },
    ),
  );
  const rewards = rewardsQuery.data ?? [];

  const applyMut = useMutation(
    trpc.sale.applyRewardDiscount.mutationOptions({
      onSuccess: (res) => {
        toast.success(
          res.discountCents > 0
            ? "Recompensa aplicada à venda"
            : "Brinde registrado nesta venda",
        );
        onApplied();
        onOpenChange(false);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Resgatar recompensa
          </DialogTitle>
          <DialogDescription>
            Recompensas de fidelidade disponíveis para este cliente.
          </DialogDescription>
        </DialogHeader>

        {!customerId ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            Selecione o cliente na venda antes de resgatar uma recompensa.
          </p>
        ) : rewardsQuery.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rewards.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Este cliente não tem recompensas disponíveis.
          </p>
        ) : (
          <div className="space-y-3">
            {hasManualDiscount && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Esta venda já tem desconto aplicado. A recompensa vai{" "}
                  <strong>substituir</strong> o desconto atual.
                </span>
              </div>
            )}
            <ul className="divide-y divide-border rounded-md border border-border">
              {rewards.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusBadge variant="info">
                        {REWARD_TYPE_LABELS[r.rewardType] ?? r.rewardType}
                      </StatusBadge>
                      <span className="text-sm font-medium tabular-nums">
                        {r.rewardType === "DISCOUNT_PERCENTAGE"
                          ? `${r.percentage}%`
                          : <Money cents={r.value} />}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.campaignName ?? "Recompensa"}
                      {r.expiresAt &&
                        ` · expira ${new Date(r.expiresAt).toLocaleDateString("pt-BR")}`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0"
                    disabled={applyMut.isPending}
                    onClick={() => applyMut.mutate({ saleId, actionId: r.id })}
                  >
                    Aplicar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
