"use client";

/**
 * Global error boundary — captura erros de renderizacao que escapam do
 * `error.tsx` de rota (ex.: erro no proprio layout raiz). Envia ao Sentry
 * (no-op sem DSN) e mostra um fallback minimo. Precisa renderizar <html>/<body>
 * porque substitui o layout raiz quando dispara.
 */
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Algo deu errado</h1>
        <p style={{ color: "#666", maxWidth: "28rem" }}>
          Ocorreu um erro inesperado. Recarregue a página ou tente novamente em
          instantes.
        </p>
      </body>
    </html>
  );
}
