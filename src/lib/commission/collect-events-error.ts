import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

/**
 * A coleta de eventos (vendas/OS) da apuracao NAO pode engolir erro de query em
 * silencio: se a query de vendas falha e o erro e suprimido, a comissao e
 * calculada SEM as vendas — o prestador recebe a MENOS e ninguem percebe
 * (auditoria backend F5, 2026-07-08). Toleramos apenas o caso legitimo de
 * "tabela/relacao inexistente" (P2021/P2010), que so ocorre num ambiente de teste
 * com schema parcial; qualquer outro erro (timeout, deadlock, coluna renomeada) e
 * RE-LANCADO para falhar visivel. Loga sempre, para haver rastro.
 *
 * Extraido do router para ser puro/testavel (importar do router arrasta o
 * NextAuth e quebra em unit).
 */
export function rethrowUnlessMissingTable(err: unknown, source: string): void {
  const code = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
  const isMissingRelation = code === "P2021" || code === "P2010";
  logger[isMissingRelation ? "warn" : "error"](
    `Provider apuracao: falha ao coletar eventos (${source})`,
    {
      code,
      missingRelation: isMissingRelation,
      err: err instanceof Error ? err.message : String(err),
    },
  );
  if (!isMissingRelation) throw err;
}
