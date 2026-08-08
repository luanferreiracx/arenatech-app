"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Lock, Wallet, LifeBuoy } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/page-header";
import { formatCentsBRL } from "@/lib/format";
import { SubscriptionPayDialog } from "@/app/(app)/settings/subscription/_components/subscription-pay-dialog";

type BlockedSubscriptionProps = {
  tenantName: string;
  /** Só o admin do tenant paga (`paySubscription` é `tenantAdminProcedure`). */
  canPay: boolean;
};

export function BlockedSubscription({ tenantName, canPay }: BlockedSubscriptionProps) {
  const trpc = useTRPC();
  const router = useRouter();
  // `payKey` remonta o dialog a cada abertura, dando estado limpo sem effect de
  // reset. Mesmo padrão de /settings/subscription.
  const [payKey, setPayKey] = useState(0);
  const [payOpen, setPayOpen] = useState(false);

  const { data } = useQuery(trpc.settings.getSubscription.queryOptions());
  const amountCents = data?.subscription?.amountCents ?? 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Assinatura suspensa"
        subtitle={`O acesso de ${tenantName} aos módulos do plano está pausado até a regularização.`}
      />

      <Card className="border-warning/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="size-5 shrink-0 text-warning" aria-hidden />
            <span className="min-w-0 break-words">O que aconteceu</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="break-words text-sm text-muted-foreground">
            A mensalidade venceu e o prazo de carência terminou. PDV, estoque, ordens de
            serviço e os demais módulos do plano voltam assim que o pagamento for
            confirmado, sem perder nenhum dado.
          </p>

          <div className="rounded-md border border-border bg-muted/40 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Wallet className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">Sua carteira continua sua</span>
            </p>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              Saldo, saques e link de cobrança DePix seguem liberados. Suspender a
              assinatura nunca bloqueia o seu dinheiro.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/depix-wallet">Abrir carteira DePix</Link>
            </Button>
          </div>

          {canPay ? (
            /* ASN-1 (Etapa 9, M17): com `amountCents = 0` — assinatura sem plano,
               valor não definido, cadastro incompleto — o valor sumia E o botão
               desabilitava. Sobrava "Pagar e reativar agora" morto, sem uma
               palavra do porquê.

               É o mesmo beco que esta tela existe para evitar: o comentário da
               `page.tsx` conta que antes o lojista caía em `/no-access` lendo
               mensagem sobre outro problema. Botão inerte sem explicação recria o
               beco dentro da própria tela de saída.

               Agora o caso sem valor diz o que houve e dá um caminho (suporte),
               em vez de um controle que não responde. */
            amountCents > 0 ? (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">
                  Valor da mensalidade:{" "}
                  <strong className="tabular-nums text-foreground">
                    {formatCentsBRL(amountCents)}
                  </strong>
                </p>
                <Button
                  className="w-full"
                  onClick={() => {
                    setPayKey((key) => key + 1);
                    setPayOpen(true);
                  }}
                >
                  Pagar e reativar agora
                </Button>
                <p className="break-words text-xs text-muted-foreground">
                  Pagamento via DePix (PIX). O QR vale 30 minutos e a reativação é
                  automática assim que o pagamento é confirmado.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
                <LifeBuoy className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p className="min-w-0 break-words">
                  A mensalidade desta loja ainda não tem valor definido, então o
                  pagamento não pode ser gerado por aqui. Fale com o suporte da Arena
                  Tech para regularizar o acesso — seus dados e sua carteira DePix
                  continuam intactos.
                </p>
              </div>
            )
          ) : (
            <div className="flex items-start gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
              <LifeBuoy className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="min-w-0 break-words">
                Só o administrador da loja pode pagar a assinatura. Avise quem administra
                {tenantName ? ` a ${tenantName}` : ""} para regularizar o acesso.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {canPay && (
        <SubscriptionPayDialog
          key={payKey}
          open={payOpen}
          amountCents={amountCents}
          onClose={() => setPayOpen(false)}
          // Pago: o webhook renova e o tenant volta a ACTIVE. `refresh` puxa a
          // sessão nova; a page redireciona para /painel quando `blocked` cai.
          onPaid={() => router.refresh()}
        />
      )}
    </div>
  );
}
