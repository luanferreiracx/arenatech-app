"use client";

import { Lock, SearchX, AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/domain/empty-state";

/**
 * Estado de tela para query que falhou.
 *
 * Existe porque "vazio", "sem permissão" e "quebrou" eram a MESMA tela no app:
 * o componente checava `isLoading` e depois assumia que `data` vazio era lista
 * vazia. Um 403 renderizava "Nenhum caixa pendente de conferencia" — o operador
 * lia que estava tudo conferido quando na verdade não podia ver nada.
 *
 * Os três estados são diferentes e o usuário precisa distinguir os três.
 */
export function QueryErrorState({
  error,
  forbiddenTitle = "Voce nao tem acesso a esta tela",
  forbiddenDescription = "Esta area e da gerencia. Peca a um administrador da loja se precisar dela.",
  notFoundTitle = "Nao encontrado",
  notFoundDescription,
}: {
  error: unknown;
  forbiddenTitle?: string;
  forbiddenDescription?: string;
  notFoundTitle?: string;
  notFoundDescription?: string;
}) {
  const status = httpStatusOf(error);
  const message = error instanceof Error ? error.message : undefined;

  if (status === 403) {
    return <EmptyState icon={Lock} title={forbiddenTitle} description={forbiddenDescription} />;
  }
  if (status === 404) {
    return (
      <EmptyState
        icon={SearchX}
        title={notFoundTitle}
        description={notFoundDescription ?? message}
      />
    );
  }
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Nao foi possivel carregar"
      description={message ?? "Tente novamente em instantes."}
    />
  );
}

function httpStatusOf(error: unknown): number | null {
  const data = (error as { data?: { httpStatus?: unknown } } | null)?.data;
  return typeof data?.httpStatus === "number" ? data.httpStatus : null;
}
