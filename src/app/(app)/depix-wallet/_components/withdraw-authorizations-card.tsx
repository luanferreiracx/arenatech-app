"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { formatCentsBRL } from "@/lib/format";

/**
 * Pedidos de saque que a API de parceiros deixou na fila do humano.
 *
 * Existe porque em carteira non-custodial o servidor NÃO consegue assinar sem a
 * senha do titular (ADR 0051) — e é isso que torna o modelo non-custodial. A
 * máquina pede, a pessoa conclui aqui.
 *
 * Só aparece quando há pedido pendente: um card vazio permanente na tela do
 * dinheiro é ruído que treina o olho a ignorar a área.
 */
export function WithdrawAuthorizationsCard({ canManage }: { canManage: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [walletPassphrase, setWalletPassphrase] = useState("");

  const pendingQuery = useQuery({
    ...trpc.depixTransaction.listWithdrawAuthorizations.queryOptions({ status: "PENDING" }),
    enabled: canManage,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.depixTransaction.listWithdrawAuthorizations.queryKey(),
    });
    queryClient.invalidateQueries({ queryKey: trpc.depixTransaction.list.queryKey() });
  };

  const authorizeMutation = useMutation(
    trpc.depixTransaction.authorizeWithdrawRequest.mutationOptions({
      onSuccess: () => {
        toast.success("Saque autorizado e enviado");
        closeDialog();
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const rejectMutation = useMutation(
    trpc.depixTransaction.rejectWithdrawRequest.mutationOptions({
      onSuccess: () => {
        toast.success("Pedido recusado");
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const closeDialog = () => {
    setTarget(null);
    setTwoFactorCode("");
    setWalletPassphrase("");
  };

  const pending = pendingQuery.data ?? [];
  if (!canManage || pending.length === 0) return null;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-amber-500" />
        <h3 className="text-sm font-semibold uppercase text-muted-foreground">
          Saques aguardando sua autorização
        </h3>
      </div>

      <p className="mb-4 text-sm text-muted-foreground break-words">
        Um parceiro pediu estes saques pela API. Como só você tem a senha da carteira, nenhum
        deles sai sem a sua confirmação.
      </p>

      <ul className="space-y-3">
        {pending.map((request) => (
          <li
            key={request.id}
            className="flex flex-col gap-3 rounded-md border p-3 @md:flex-row @md:items-center @md:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <p className="font-medium tabular-nums">{formatCentsBRL(request.netAmountCents)}</p>
              <p className="truncate text-sm text-muted-foreground">
                {request.recipientName ?? "Destinatário não informado"} · {request.pixKey}
              </p>
              <p className="text-xs text-muted-foreground break-words">
                Pedido pela integração {request.keyPrefix}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ authorizationId: request.id })}
              >
                Recusar
              </Button>
              <Button size="sm" onClick={() => setTarget(request.id)}>
                Autorizar
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={target !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Autorizar saque</DialogTitle>
            <DialogDescription>
              O saque sai agora, com o valor e o destino que o parceiro pediu. Transação na
              Liquid não tem estorno.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="auth-2fa">Código 2FA</Label>
              <Input
                id="auth-2fa"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                placeholder="000000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-passphrase" className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                Senha da carteira
              </Label>
              <Input
                id="auth-passphrase"
                type="password"
                autoComplete="off"
                value={walletPassphrase}
                onChange={(e) => setWalletPassphrase(e.target.value)}
                placeholder="Sua senha da carteira"
              />
              <p className="text-xs text-muted-foreground break-words">
                Só você conhece esta senha. Ela libera a assinatura do saque e não fica guardada
                no sistema.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={authorizeMutation.isPending}>
              Cancelar
            </Button>
            <Button
              disabled={
                authorizeMutation.isPending ||
                twoFactorCode.trim().length === 0 ||
                walletPassphrase.length === 0
              }
              onClick={() =>
                target &&
                authorizeMutation.mutate({
                  authorizationId: target,
                  twoFactorCode: twoFactorCode.trim(),
                  walletPassphrase,
                })
              }
            >
              {authorizeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar saque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
