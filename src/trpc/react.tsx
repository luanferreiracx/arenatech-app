"use client";

import { createTRPCContext } from "@trpc/tanstack-react-query";
import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client";
import {
  keepPreviousData,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import superjson from "superjson";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";

import { type AppRouter } from "@/server/api/root";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Falha de query era engolida no app inteiro: sem onError e sem
        // throwOnError, um erro de backend renderizava como "sem dados" (tabela
        // vazia, R$ 0). Agora toda query que falha vira toast + Sentry, sem
        // derrubar a tela (não usamos throwOnError global pra um widget não
        // crashar a página inteira). (T5)
        queryCache: new QueryCache({
          onError: (error, query) => {
            Sentry.captureException(error, {
              tags: { source: "react-query" },
              extra: { queryKey: query.queryKey },
            });
            toast.error("Falha ao carregar dados. Tente novamente.", {
              // id estável = colapsa múltiplas falhas simultâneas num só toast.
              id: "query-error",
              description: error instanceof Error ? error.message : undefined,
            });
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            // Mantém os dados anteriores enquanto a próxima página/filtro carrega
            // — listas paginadas não piscam pra skeleton a cada interação.
            placeholderData: keepPreviousData,
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
