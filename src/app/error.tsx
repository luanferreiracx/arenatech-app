"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Algo deu errado</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Ocorreu um erro inesperado. Tente novamente ou volte para a pagina
          inicial.
        </p>
      </div>

      <div className="flex gap-3">
        <Button onClick={reset}>Tentar novamente</Button>
        <Button variant="outline" asChild>
          <Link href="/">Voltar ao inicio</Link>
        </Button>
      </div>
    </div>
  );
}
