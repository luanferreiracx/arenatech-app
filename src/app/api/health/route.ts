import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Healthcheck da aplicação.
 *
 * Por que existe (auditoria 2026-08-05, P1-B3): `/api/health` estava na
 * allowlist de rotas públicas (`public-routes.ts`) desde sempre e **a rota nunca
 * foi criada** — em produção devolvia 404 com HTML. Somado a isso, o container
 * do app não tinha `HEALTHCHECK` (Postgres e LWK tinham) e nada externo batia
 * no endpoint. Ou seja: o processo que serve todos os clientes não era
 * monitorado por ninguém.
 *
 * `restart: unless-stopped` só age em processo MORTO. Um app pendurado (event
 * loop travado, pool esgotado, deadlock) fica de pé, sem servir, e ninguém
 * descobre até um cliente reclamar.
 *
 * ## O que é verificado, e por quê
 *
 * Um health que devolve 200 fixo é decoração: sobe junto com o processo e nunca
 * muda de ideia. Este toca o **banco**, que é a dependência sem a qual nenhuma
 * requisição real funciona (toda procedure roda em transação por causa do RLS).
 *
 * Não verifica Redis, MinIO nem LWK de propósito: o app degrada sem eles
 * (rate-limit cai para in-memory, imagem não carrega, saque recusa) mas continua
 * atendendo. Marcá-los como "unhealthy" faria o orquestrador reiniciar um app
 * que está funcionando — trocar degradação parcial por indisponibilidade total.
 *
 * ## Contrato
 *
 * - `200 {status:"ok"}` — app de pé e banco respondendo
 * - `503 {status:"degraded"}` — app de pé, banco inacessível
 *
 * Nunca lança: um healthcheck que estoura 500 por bug próprio é pior que não
 * ter. E não expõe versão, host nem detalhe de erro — é rota pública.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    // `SELECT 1` fora de transação: mede conectividade e disponibilidade do
    // pool sem segurar conexão, que é justamente o recurso escasso aqui.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", db: "up", latencyMs: Date.now() - startedAt },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    logger.error("healthcheck: banco inacessivel", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { status: "degraded", db: "down" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
