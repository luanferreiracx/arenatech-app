/**
 * Saque pedido pela API de parceiros em carteira que o servidor não assina
 * sozinho (ADR 0051 — non-custodial).
 *
 * ## Por que existe
 *
 * O saque da API de parceiros exigia carteira CUSTODIAL. Desde o ADR 0051
 * nenhum cliente é custodial: `setupWallet` só cria `non_custodial` ou
 * `external`, e `lwk.createWallet` (o caminho custodial) não tem um único
 * chamador no app. Medido em produção: das 5 carteiras, as 2 custodiais são da
 * própria Arena (central e taxas) e as 3 de cliente são 2 non-custodial e 1
 * external. O endpoint de saque da ADR 0057 estava inalcançável por 100% dos
 * clientes — não era uma lacuna, era superfície morta.
 *
 * ## Por que não basta aceitar a senha na API
 *
 * Em carteira non-custodial a seed é cifrada com uma passphrase que só o titular
 * conhece, e o LWK só assina decifrando com ela. Aceitar essa senha num header
 * de API desmontaria a garantia inteira: a Arena passaria a poder gastar sozinha
 * o dinheiro do cliente, que é precisamente o que o modelo non-custodial
 * promete que não acontece.
 *
 * Então o parceiro PEDE e o humano AUTORIZA. Este módulo é a fila desse pedido.
 *
 * ## O que este fluxo NÃO faz
 *
 * Não reserva saldo, não chama a Eulen, não toca no LWK e não altera uma linha
 * do `createWithdraw`. O saque de verdade nasce só na autorização, pelo mesmo
 * caminho de sempre, com todas as guardas que ele já tem (dedupe por intenção,
 * cap diário, lock anti-corrida, gate de cache, teto do provedor).
 */
import { TRPCError } from "@trpc/server";
import { withAdmin, withTenant } from "@/server/db";
import { logger } from "@/lib/logger";
import { createWithdraw } from "@/server/services/depix-transaction.service";
import { Prisma, type PixKeyType } from "@prisma/client";

/**
 * Validade do pedido.
 *
 * Pedido velho numa fila de dinheiro é ruído perigoso: quem autoriza dois dias
 * depois já não lembra do contexto que o gerou e aprova no automático. Um dia é
 * folga suficiente para o humano ver e curto o bastante para o contexto durar.
 */
const AUTHORIZATION_TTL_MS = 24 * 60 * 60_000;

export type WithdrawAuthorizationRequest = {
  tenantId: string;
  keyPrefix: string;
  idempotencyKey: string;
  pixKeyType: PixKeyType;
  pixKey: string;
  recipientName?: string | null;
  recipientTaxId: string;
  netAmountCents: number;
  description?: string | null;
};

/**
 * Registra o pedido do parceiro. Idempotente por (tenant, idempotencyKey): o
 * retry de um cliente HTTP cai no MESMO pedido em vez de enfileirar dois
 * idênticos para o humano — dois pedidos iguais na fila é o que vira pagamento
 * em dobro quando alguém autoriza os dois sem perceber.
 */
export async function requestWithdrawAuthorization(args: WithdrawAuthorizationRequest) {
  const existing = await withTenant(args.tenantId, async (tx) =>
    tx.depixWithdrawAuthorization.findFirst({
      where: { tenantId: args.tenantId, idempotencyKey: args.idempotencyKey },
    }),
  );
  if (existing) return existing;

  // Entre o SELECT acima e este INSERT existe janela de corrida — duas entregas
  // simultâneas da mesma requisição (retry automático do cliente HTTP) chegam
  // juntas. Quem fecha é o índice único; ao perder a corrida, o P2002 traz de
  // volta para o caminho de reuso. Sem este tratamento, o retry que deveria ser
  // inócuo viraria um 500 na cara do parceiro.
  let created;
  try {
    created = await withTenant(args.tenantId, async (tx) =>
      tx.depixWithdrawAuthorization.create({
        data: {
          tenantId: args.tenantId,
          keyPrefix: args.keyPrefix,
          idempotencyKey: args.idempotencyKey,
          pixKeyType: args.pixKeyType,
          pixKey: args.pixKey,
          recipientName: args.recipientName ?? null,
          recipientTaxId: args.recipientTaxId,
          netAmountCents: args.netAmountCents,
          description: args.description ?? null,
          expiresAt: new Date(Date.now() + AUTHORIZATION_TTL_MS),
        },
      }),
    );
  } catch (err) {
    const isDuplicate =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
    if (!isDuplicate) throw err;
    return withTenant(args.tenantId, async (tx) =>
      tx.depixWithdrawAuthorization.findFirstOrThrow({
        where: { tenantId: args.tenantId, idempotencyKey: args.idempotencyKey },
      }),
    );
  }

  logger.info("partner-api: saque pedido para autorizacao humana", {
    tenantId: args.tenantId,
    keyPrefix: args.keyPrefix,
    authorizationId: created.id,
    netAmountCents: args.netAmountCents,
  });
  return created;
}

/**
 * Chave de idempotência entregue ao `createWithdraw`.
 *
 * Derivada do ID do pedido, e é ela que torna seguro devolver o pedido para
 * PENDING quando a autorização falha: numa segunda tentativa o `createWithdraw`
 * reconhece a mesma chave e devolve o saque que já existe, em vez de criar um
 * segundo. Sem isso, "reverter e tentar de novo" seria uma receita de saque
 * duplicado — o erro que já custou um pagamento em dobro nesta casa.
 */
function withdrawKeyFor(authorizationId: string): string {
  return `auth:${authorizationId}`;
}

/**
 * Autoriza o pedido: cria o saque de verdade com a passphrase do titular.
 *
 * A ordem importa. Primeiro reivindica o pedido com um CAS (PENDING →
 * AUTHORIZED); só quem ganhou a corrida chama o `createWithdraw`. Duas abas do
 * painel autorizando o mesmo pedido produzem um saque, não dois.
 */
export async function authorizeWithdrawRequest(args: {
  tenantId: string;
  authorizationId: string;
  userId: string;
  userName?: string | null;
  passphrase?: string;
}) {
  const authorization = await withTenant(args.tenantId, async (tx) =>
    tx.depixWithdrawAuthorization.findFirst({
      where: { id: args.authorizationId, tenantId: args.tenantId },
    }),
  );
  if (!authorization) throw new TRPCError({ code: "NOT_FOUND" });
  if (authorization.status !== "PENDING") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Este pedido já foi ${authorization.status === "AUTHORIZED" ? "autorizado" : "encerrado"}.`,
    });
  }
  if (authorization.expiresAt.getTime() < Date.now()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Este pedido venceu. Peça ao parceiro para enviar de novo.",
    });
  }

  // CAS: quem não mudar a linha não segue. Guarda contra duas autorizações
  // simultâneas do mesmo pedido.
  const claimed = await withTenant(args.tenantId, async (tx) =>
    tx.depixWithdrawAuthorization.updateMany({
      where: { id: authorization.id, tenantId: args.tenantId, status: "PENDING" },
      data: { status: "AUTHORIZED", resolvedByUserId: args.userId, resolvedAt: new Date() },
    }),
  );
  if (claimed.count !== 1) {
    throw new TRPCError({ code: "CONFLICT", message: "Este pedido acabou de ser decidido." });
  }

  try {
    const transaction = await createWithdraw({
      tenantId: args.tenantId,
      userId: args.userId,
      userName: args.userName ?? null,
      pixKeyType: authorization.pixKeyType,
      pixKey: authorization.pixKey,
      recipientName: authorization.recipientName,
      recipientTaxId: authorization.recipientTaxId,
      netAmountCents: authorization.netAmountCents,
      idempotencyKey: withdrawKeyFor(authorization.id),
      sourceType: "WALLET",
      sourceDescription:
        authorization.description ?? `Saque autorizado (API ${authorization.keyPrefix})`,
      passphrase: args.passphrase,
    });

    await withTenant(args.tenantId, async (tx) =>
      tx.depixWithdrawAuthorization.update({
        where: { id: authorization.id },
        data: { transactionId: transaction.id },
      }),
    );
    return transaction;
  } catch (err) {
    // Devolve para a fila para o humano poder corrigir e tentar de novo (senha
    // errada, saldo insuficiente, cache a reparar). Seguro porque a chave de
    // idempotência é derivada do pedido: se o saque chegou a nascer antes do
    // erro, a próxima tentativa devolve AQUELE, não um segundo.
    await withTenant(args.tenantId, async (tx) =>
      tx.depixWithdrawAuthorization.updateMany({
        where: { id: authorization.id, tenantId: args.tenantId, status: "AUTHORIZED" },
        data: { status: "PENDING", resolvedByUserId: null, resolvedAt: null },
      }),
    );
    throw err;
  }
}

/** Recusa o pedido. Decisão de quem opera o tenant, não do parceiro. */
export async function rejectWithdrawRequest(args: {
  tenantId: string;
  authorizationId: string;
  userId: string;
  reason?: string | null;
}) {
  const rejected = await withTenant(args.tenantId, async (tx) =>
    tx.depixWithdrawAuthorization.updateMany({
      where: { id: args.authorizationId, tenantId: args.tenantId, status: "PENDING" },
      data: {
        status: "REJECTED",
        resolvedByUserId: args.userId,
        resolvedAt: new Date(),
        rejectionReason: args.reason ?? null,
      },
    }),
  );
  if (rejected.count !== 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Este pedido já foi decidido." });
  }
}

/**
 * Caduca os pedidos vencidos. Roda de carona no cron de reconcile.
 *
 * Cross-tenant de propósito (`withAdmin`): é varredura de manutenção, não
 * operação de um tenant.
 */
export async function expireStaleWithdrawAuthorizations(): Promise<{ expired: number }> {
  const result = await withAdmin(async (tx) =>
    tx.depixWithdrawAuthorization.updateMany({
      where: { status: "PENDING", expiresAt: { lt: new Date() } },
      data: { status: "EXPIRED" },
    }),
  );
  if (result.count > 0) {
    logger.info("partner-api: pedidos de saque vencidos", { expired: result.count });
  }
  return { expired: result.count };
}
