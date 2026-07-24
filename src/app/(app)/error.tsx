"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary do segmento autenticado (app). Diferente do `app/error.tsx`
 * (raiz), este renderiza DENTRO do layout do (app) — a sidebar e o header são
 * preservados e o erro aparece inline na área de conteúdo. Assim um erro de
 * render numa página não derruba a navegação inteira (o balconista não perde o
 * shell nem precisa recarregar do zero).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Algo deu errado nesta tela</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Ocorreu um erro inesperado ao carregar esta página. Você pode tentar de novo
          sem perder a navegação, ou ir para o painel.
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={reset}>Tentar novamente</Button>
        <Button variant="outline" onClick={() => router.push("/painel")}>
          Ir para o painel
        </Button>
      </div>
    </div>
  );
}
