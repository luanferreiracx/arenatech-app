"use client";

import { Logo } from "@/components/branding/logo";
import { TwoFactorCard } from "@/components/domain/security/two-factor-card";

/**
 * Página de enrollment OBRIGATÓRIO de 2FA. O proxy redireciona para cá os
 * superadmins/admins sem 2FA quando TWO_FACTOR_ENFORCE=true. Rota top-level
 * (fora de (app)/(auth)) para não depender de tenant ativo nem do chrome do app.
 */
export default function Setup2faPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Logo size="lg" variant="full" />
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold">Ative a verificação em duas etapas</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta exige 2FA. Configure agora para continuar acessando o sistema.
          </p>
        </div>

        <TwoFactorCard onDone={() => (window.location.href = "/painel")} />

        <p className="text-center text-xs">
          <a href="/logout" className="text-muted-foreground hover:text-primary transition-colors">
            Sair
          </a>
        </p>
      </div>
    </div>
  );
}
