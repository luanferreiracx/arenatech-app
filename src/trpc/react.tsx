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
import { readableFetch } from "@/trpc/readable-fetch";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * Status HTTP de um erro do tRPC, quando houver. O erro chega como
 * `TRPCClientError`, que carrega `data.httpStatus`; qualquer outra coisa
 * (falha de rede, abort) não tem status e é tratada como transitória.
 */
function httpStatusOf(error: unknown): number | null {
  const data = (error as { data?: { httpStatus?: unknown } } | null)?.data;
  return typeof data?.httpStatus === "number" ? data.httpStatus : null;
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
            const status = httpStatusOf(error);
            const isBusinessAnswer = status !== null && status >= 400 && status < 500;
            // 4xx é resposta esperada do negócio (sem permissão, não existe) —
            // mandar isso pro Sentry afoga o sinal do que é defeito de verdade.
            if (!isBusinessAnswer) {
              Sentry.captureException(error, {
                tags: { source: "react-query" },
                extra: { queryKey: query.queryKey },
              });
            }
            toast.error(
              // "Tente novamente" numa negativa de permissão é conselho falso:
              // tentar de novo dá o mesmo 403.
              isBusinessAnswer ? "Nao foi possivel carregar" : "Falha ao carregar dados. Tente novamente.",
              {
                // id estável = colapsa múltiplas falhas simultâneas num só toast.
                id: "query-error",
                description: error instanceof Error ? error.message : undefined,
              },
            );
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            // Mantém os dados anteriores enquanto a próxima página/filtro carrega
            // — listas paginadas não piscam pra skeleton a cada interação.
            placeholderData: keepPreviousData,
            // Erro 4xx é resposta do NEGÓCIO, não falha de rede: "nenhum caixa
            // aberto" (404) e "sem permissão" (403) não mudam se perguntarmos de
            // novo. Com o retry padrão (3x com backoff), a tela ficava ~7s em
            // esqueleto antes de contar a verdade — foi assim que a varredura de
            // navegador achou /cashier/close e /cashier/reviews parecendo
            // travados. Retry fica só para o que pode ser transitório.
            retry: (failureCount, error) => {
              const status = httpStatusOf(error);
              if (status !== null && status >= 400 && status < 500) return false;
              return failureCount < 2;
            },
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
          // Sem isto, uma página de erro em HTML (502 da borda, 413 do proxy)
          // estoura no parser do navegador e chega ao Sentry como um erro de
          // sintaxe anônimo. Ver readable-fetch.ts.
          fetch: readableFetch,
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
