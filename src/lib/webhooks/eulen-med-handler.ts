import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { recordWebhookEvent, markWebhookProcessed } from "@/lib/webhooks/replay-guard";

/** Payload do webhook MED da Eulen (docs.eulen.app — MEDWebhookBody). */
export interface EulenMedPayload {
  webhookType?: string;
  qrId?: string;
  bankTxId?: string;
  blockchainTxID?: string;
  creationDateReport?: string;
  euid?: string;
  name?: string;
  partnerId?: string;
  principalValueInCents?: number;
  taxNumber?: string;
  [key: string]: unknown;
}

/**
 * Processa o webhook MED (Mecanismo Especial de Devolucao) da Eulen: um deposito
 * ja PAGO foi DEVOLVIDO pelo Banco Central (golpe/fraude/contestacao). Pode
 * chegar DEPOIS de ja termos creditado o saldo.
 *
 * IMPORTANTE: o saldo do tenant e o DePix ON-CHAIN real na carteira. Apos o MED,
 * o DePix continua fisicamente la (a Eulen devolveu o PIX/fiat ao pagador, nao o
 * cripto). Debitar automaticamente exigiria assinar uma tx com a chave do tenant
 * — IMPOSSIVEL em non-custodial (sem a passphrase do usuario). Por isso NAO
 * estornamos automaticamente: marcamos a tx como MED_REFUNDED (pendencia),
 * registramos o report e ALERTAMOS (logger.error -> Sentry). A decisao
 * (devolver o DePix, reter, etc.) e humana.
 */
export async function handleEulenMedWebhook(
  payload: EulenMedPayload,
  sourceIp: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const qrId = payload.qrId;
  if (!qrId) {
    return { status: 400, body: { error: "missing qrId" } };
  }

  // Idempotencia por (qrId, "med").
  const eventKey = `${qrId}:med`;
  const isNew = await recordWebhookEvent({
    provider: "eulen_med",
    eventId: eventKey,
    eventType: "med",
    sourceIp,
    signatureValid: true,
    payload,
  });
  if (!isNew) {
    logger.info("Eulen-MED webhook: evento duplicado", { eventKey });
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  const txRow = await withAdmin((tx) =>
    tx.tenantDepixTransaction.findFirst({
      where: { pixpayDepixId: qrId, kind: "DEPOSIT" },
      select: { id: true, tenantId: true, status: true, number: true, netAmountCents: true },
    }),
  );
  if (!txRow) {
    await markWebhookProcessed("eulen_med", eventKey, { ok: false, errorMessage: "not_found" });
    // Ainda assim alerta: um MED sem deposito nosso e estranho e merece olhar.
    logger.error("Eulen-MED: devolucao de deposito DESCONHECIDO — verificar", {
      qrId,
      principalValueInCents: payload.principalValueInCents,
      taxNumber: payload.taxNumber,
    });
    return { status: 200, body: { ok: true, matched: false } };
  }

  // Marca MED_REFUNDED (pendencia). Nao reverte um deposito que ja virou MED.
  await withAdmin((tx) =>
    tx.tenantDepixTransaction.updateMany({
      where: { id: txRow.id, status: { not: "MED_REFUNDED" } },
      data: {
        status: "MED_REFUNDED",
        medReportedAt: new Date(),
        errorMessage: "Deposito devolvido pelo BC (MED)",
        apiResponse: payload as never,
      },
    }),
  );

  await markWebhookProcessed("eulen_med", eventKey, { ok: true });

  // ALERTA FORTE (Sentry): exige acao humana — o DePix pode ja ter sido
  // creditado/sacado; o estorno on-chain nao e automatico.
  logger.error("Eulen-MED: deposito DEVOLVIDO apos pago — pendencia de reconciliacao", {
    txId: txRow.id,
    number: txRow.number,
    tenantId: txRow.tenantId,
    qrId,
    statusAnterior: txRow.status,
    principalValueInCents: payload.principalValueInCents,
    netAmountCents: txRow.netAmountCents,
    payerTaxNumber: payload.taxNumber,
    payerName: payload.name,
  });

  return { status: 200, body: { ok: true, matched: true, status: "MED_REFUNDED" } };
}
