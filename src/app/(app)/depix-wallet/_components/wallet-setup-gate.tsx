"use client";

import Link from "next/link";
import { Wallet, ArrowDownToLine, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface WalletSetupGateProps {
  /** Admin do tenant pode iniciar o setup; demais perfis so veem o aviso. */
  canConfigure: boolean;
}

/**
 * Estado da overview quando o tenant ainda nao tem carteira (ADR 0051):
 * a carteira nasce non-custodial no 1o acesso. Admin recebe o CTA para o
 * wizard de criar/importar; demais perfis sao orientados a chamar um admin.
 */
export function WalletSetupGate({ canConfigure }: WalletSetupGateProps) {
  return (
    <Card className="p-6 sm:p-8 bg-linear-to-br from-card via-card to-primary/[0.05] border-b-2 border-b-primary/30">
      <div className="flex flex-col items-center text-center gap-4 max-w-md mx-auto">
        <div className="h-14 w-14 rounded-full bg-primary/10 grid place-items-center">
          <Wallet className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">Configure sua carteira DePix</h2>
          <p className="text-sm text-muted-foreground">
            {canConfigure
              ? "Crie uma nova carteira Liquid ou importe uma que voce ja tenha. Voce define uma senha que so voce conhece — sem ela, nem a Arena Tech acessa seus fundos."
              : "A carteira DePix deste tenant ainda nao foi configurada. Peca a um usuario admin do tenant para criar ou importar a carteira."}
          </p>
        </div>

        {canConfigure && (
          <Button asChild size="lg" className="mt-1">
            <Link href="/depix-wallet/setup">
              <Sparkles className="mr-2 h-4 w-4" />
              Configurar carteira
            </Link>
          </Button>
        )}

        <div className="grid grid-cols-2 gap-3 w-full mt-2 text-left">
          <div className="rounded-lg border border-border bg-card/50 p-3">
            <Sparkles className="h-4 w-4 text-primary mb-1.5" />
            <p className="text-xs font-medium">Criar nova</p>
            <p className="text-[11px] text-muted-foreground">
              Geramos 24 palavras de recuperacao para voce guardar.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card/50 p-3">
            <ArrowDownToLine className="h-4 w-4 text-primary mb-1.5" />
            <p className="text-xs font-medium">Importar existente</p>
            <p className="text-[11px] text-muted-foreground">
              Use as 24 palavras de uma carteira Liquid que voce ja tem.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
