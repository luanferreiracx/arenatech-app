import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { recordWebhookEvent, markWebhookProcessed } from "@/lib/webhooks/replay-guard";
import { verifyDepositOnChain } from "@/lib/webhooks/lwk-deposit-handler";
import { propagateDepositNotPaid } from "@/lib/webhooks/depix-deposit-propagate";
import {
  settleDepositConfirmed,
  settleDepositViaFeeWallet,
  applyPixReceivedEffects,
  depositUnderpayToleranceCents,
} from "@/server/services/depix-transaction.service";
import { handleStaticQrDeposit } from "@/lib/webhooks/eulen-static-qr-handler";
import { getFeeWalletTenantId } from "@/server/services/depix-fee-wallet.service";
import { getPixStatus, isDepixConfigured } from "@/lib/services/depix-service";

/** Payload do webhook de deposito da Eulen (docs.eulen.app — DepositWebhookBody). */
export interface EulenDepositPayload {
  webhookType?: string;
  qrId?: string;
  status?: string;
  valueInCents?: number;
  pixKey?: string;
  payerName?: string;
  payerTaxNumber?: string;
  blockchainTxID?: string;
  bankTxId?: string;
  [key: string]: unknown;
}

const PAID_ONCHAIN_STATUSES = new Set(["depix_sent"]);
// `approved` E `delayed` significam PIX RECEBIDO (o cliente pagou). O `delayed` e o
// novo estado da Eulen quando o DePix e segurado por ~24h (delayUntil) antes de ir
// on-chain — o PIX ja caiu, entao LIBERA a venda igual ao `approved`. O saldo so e
// creditado no `depix_sent` (on-chain), 24h depois. `under_review` NAO libera (a
// Eulen ainda esta revisando o pagamento).
const PIX_APPROVED_STATUSES = new Set(["approved", "delayed"]);

/**
 * Timeout curto do cross-check on-chain (LWK) DENTRO do webhook. A Eulen desiste
 * em ~15s; o cliente LWK tem default de 30s. Quando o LWK fica lento, o webhook
 * estourava o SLA ("Timeout, took more than 15 seconds") — bug real observado em
 * prod (08/07, LWK intermitentemente indisponivel). Com um teto de 8s, se o LWK
 * nao responde a tempo o cross-check retorna `lwk_unavailable`, a tx fica
 * PROCESSING (txid ja gravado) e o cron creditDepositIfConfirmedOnChain credita
 * depois — sem perda, e o webhook responde 200 dentro do SLA.
 */
const WEBHOOK_LWK_CROSSCHECK_TIMEOUT_MS = 8_000;

/**
 * Revalidacao anti-forja do marco `approved` (auditoria de seguranca S1/S2).
 *
 * O `approved` (PIX recebido) e o unico marco que LIBERA a venda (marca
 * QuickSale/PaymentLink como PAID + SSE no PDV) dependendo SO do webhook — e a
 * auth do webhook e um secret GLOBAL. Se ele vazar, um `approved` forjado
 * enganaria o vendedor com um "pago" falso. Antes de aplicar o efeito de venda,
 * consultamos a Eulen ATIVAMENTE (getPixStatus, canal autenticado por API-key,
 * NAO o webhook) e so liberamos se ela CONCORDAR que o PIX foi recebido/pago.
 *
 * Fail-safe: se a Eulen esta fora do ar / responde erro, retornamos `false` —
 * NAO liberamos a venda por um webhook nao-corroborado. A tx ainda vai a
 * PROCESSING (o PIX pode ter caido de fato); o proximo ciclo de
 * checkTransactionStatus/reconciliacao reconsulta e libera a venda legitima.
 * Assim: forja nao engana o vendedor, e venda real confirma no ciclo seguinte.
 *
 * O crédito de SALDO ja tem cross-check on-chain proprio — esta guarda e so pro
 * efeito de VENDA do marco `approved`.
 */
// Timeout curto: o webhook Eulen precisa responder em ~15s. A revalidação usa um
// teto bem menor para não estourar o SLA (se a Eulen demorar, tratamos como
// não-corroborado e a reconciliação libera a venda legítima depois).
const APPROVED_REVALIDATION_TIMEOUT_MS = 5_000;

async function eulenConfirmsPixReceived(qrId: string): Promise<boolean> {
  // Sem credencial da Eulen (dev/teste) não há canal para corroborar — não
  // bloqueia (e a forja exige o secret de PROD, que não existe aqui de qualquer
  // forma). Mantém o comportamento antigo fora de produção.
  if (!isDepixConfigured()) return true;

  const ps = await getPixStatus(qrId, { timeoutMs: APPROVED_REVALIDATION_TIMEOUT_MS });
  if (!ps.success) {
    logger.warn("Eulen-deposit: revalidacao do `approved` falhou (Eulen indisponivel) — nao libera venda ainda", {
      qrId,
      error: ps.error,
    });
    return false;
  }
  // A Eulen concorda se o PIX foi recebido (pix_received) ou ja evoluiu (paid/
  // depix_sent/completed). `pending` = ela ainda NAO viu o pagamento → nao libera.
  const corroborated = ps.status !== "pending";
  if (!corroborated) {
    logger.warn("Eulen-deposit: `approved` do webhook NAO corroborado pela Eulen (status pending) — possivel forja", {
      qrId,
      eulenStatus: ps.status,
    });
  }
  return corroborated;
}
const EXPIRED_STATUSES = new Set(["expired"]);
const FAILED_STATUSES = new Set(["refunded", "will_refund", "canceled", "error"]);

/**
 * Nome do pagador vindo da Eulen (`payerName`), pronto pra mesclar no `data:` de
 * um update. Retorna `{}` se ausente — assim NUNCA sobrescreve com null/undefined.
 */
function payerNamePatch(payload: EulenDepositPayload): { payerName?: string } {
  const name = typeof payload.payerName === "string" ? payload.payerName.trim() : "";
  return name ? { payerName: name } : {};
}

/**
 * Processa o webhook de DEPOSITO da Eulen.
 *
 * - `approved`  : PIX recebido — marca pixApprovedAt (UX "confirmando na rede").
 *                 NAO credita (o DePix ainda nao chegou on-chain).
 * - `depix_sent`: a Eulen enviou o DePix on-chain (com blockchainTxID). Faz o
 *                 CROSS-CHECK on-chain (>=2 conf + amount confere) e credita
 *                 (COMPLETED) na hora. Se ainda nao confirmado, fica PROCESSING e
 *                 o monitor LWK + cron completam (rede de seguranca).
 * - expired/refunded/canceled/error: finaliza a tx + propaga p/ QuickSale.
 */
export async function handleEulenDepositWebhook(
  payload: EulenDepositPayload,
  sourceIp: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const qrId = payload.qrId;
  const statusRaw = (payload.status ?? "").toLowerCase();

  // qrId vazio = pagamento no QR PIX ESTATICO (chave fixa da intermediadora,
  // exclusivo do tenant central). Handler dedicado cria/credita a tx STATIC_QR.
  if (!qrId) {
    return handleStaticQrDeposit(payload, sourceIp);
  }

  // Idempotencia por (qrId, status).
  const eventKey = `${qrId}:${statusRaw}`;
  const isNew = await recordWebhookEvent({
    provider: "eulen_deposit",
    eventId: eventKey,
    eventType: statusRaw,
    sourceIp,
    signatureValid: true,
    payload,
  });
  if (!isNew) {
    logger.info("Eulen-deposit webhook: evento duplicado", { eventKey });
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  const txRow = await withAdmin((tx) =>
    tx.tenantDepixTransaction.findFirst({
      where: { pixpayDepixId: qrId, kind: "DEPOSIT" },
      select: {
        id: true,
        tenantId: true,
        status: true,
        depositLabel: true,
        depositAddress: true,
        depositReceivingTenantId: true,
        isByow: true,
      },
    }),
  );
  if (!txRow) {
    await markWebhookProcessed("eulen_deposit", eventKey, { ok: false, errorMessage: "not_found" });
    logger.warn("Eulen-deposit webhook: deposito desconhecido", { qrId, statusRaw });
    return { status: 200, body: { ok: true, matched: false } };
  }

  // ── PIX aprovado: o cliente pagou (fiat caiu). Marca PROCESSING na hora
  //    (pagamento confirmado, aguardando o DePix on-chain) e LIBERA a venda
  //    (PDV/QuickSale). NAO credita saldo (isso e COMPLETED, on-chain).
  if (PIX_APPROVED_STATUSES.has(statusRaw)) {
    await withAdmin((tx) =>
      tx.tenantDepixTransaction.updateMany({
        where: { id: txRow.id, status: "PENDING" },
        data: { status: "PROCESSING", pixApprovedAt: new Date(), ...payerNamePatch(payload) },
      }),
    );
    // Anti-forja (S1/S2): so LIBERA a venda se a Eulen corroborar o `approved`
    // por consulta ativa (canal por API-key, nao o webhook). Um webhook forjado
    // com o secret vazado nao passa daqui. Se a Eulen esta indisponivel, a venda
    // NAO e liberada agora — fica PROCESSING e o checkTransactionStatus/cron
    // reconsulta e libera a venda legitima depois.
    const corroborated = await eulenConfirmsPixReceived(qrId);
    if (corroborated) {
      // Efeito de venda (QuickSale->PAID + notify SSE). Tenant REAL (a venda e
      // dele, nao da carteira de taxas). Idempotente.
      await applyPixReceivedEffects(txRow.tenantId, txRow.id);
    }
    await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
    return { status: 200, body: { ok: true, pixApproved: true, saleReleased: corroborated } };
  }

  // ── BYOW: o DePix foi pra carteira PRÓPRIA do tenant (não a nossa). Não dá
  //    pra cross-check on-chain (o endereço não está no nosso LWK) — a Eulen é a
  //    fonte de verdade. Marca COMPLETED com o valueInCents dela e encerra. Não
  //    credita saldo interno (a Arena não custodia esse endereço) nem faz 2ª tx.
  if (txRow.isByow && PAID_ONCHAIN_STATUSES.has(statusRaw)) {
    if (["COMPLETED", "COMPLETED_FEE_PENDING"].includes(txRow.status)) {
      await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
      return { status: 200, body: { ok: true, byow: true, alreadyCompleted: true } };
    }
    const netCents = payload.valueInCents ?? null;
    await withAdmin((tx) =>
      tx.tenantDepixTransaction.updateMany({
        where: { id: txRow.id, status: { in: ["PENDING", "PROCESSING"] } },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          depositTxId: payload.blockchainTxID ?? null,
          netAmountCents: netCents,
          pixApprovedAt: new Date(),
          ...payerNamePatch(payload),
        },
      }),
    );
    // Libera efeito de venda (QuickSale/PDV) — idempotente.
    await applyPixReceivedEffects(txRow.tenantId, txRow.id);
    await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
    logger.info("Eulen-deposit webhook: depósito BYOW concluído (sem cross-check LWK)", {
      qrId,
      id: txRow.id,
    });
    return { status: 200, body: { ok: true, byow: true, completed: true } };
  }

  // ── DePix enviado on-chain: cross-check + credita ──
  if (PAID_ONCHAIN_STATUSES.has(statusRaw)) {
    const blockchainTxId = payload.blockchainTxID;
    if (!blockchainTxId) {
      // Sem txid nao da pra cross-check on-chain; deixa o monitor on-chain
      // creditar o saldo. Mas o PIX ja caiu -> marca PROCESSING.
      await withAdmin((tx) =>
        tx.tenantDepixTransaction.updateMany({
          where: { id: txRow.id, status: "PENDING" },
          data: { status: "PROCESSING", pixApprovedAt: new Date(), ...payerNamePatch(payload) },
        }),
      );
      // Anti-forja (S1/S2): igual ao branch `approved`, so LIBERA a venda se a
      // Eulen corroborar por consulta ativa (API-key, nao o webhook). Sem txid
      // nao ha cross-check on-chain, entao esta e a unica barreira contra um
      // webhook `depix_sent` forjado (secret vazado) liberar venda/assinatura.
      // Se a Eulen esta indisponivel, fica PROCESSING e o cron reconsulta depois.
      const corroborated = await eulenConfirmsPixReceived(qrId);
      if (corroborated) {
        await applyPixReceivedEffects(txRow.tenantId, txRow.id);
      }
      await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
      return {
        status: 200,
        body: { ok: true, depixSent: true, awaitingMonitor: true, saleReleased: corroborated },
      };
    }

    // Ja concluido? idempotente.
    if (["COMPLETED", "COMPLETED_FEE_PENDING", "PROCESSING_FEE"].includes(txRow.status)) {
      await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
      return { status: 200, body: { ok: true, alreadySettling: true } };
    }

    const feeWalletTenantId = await getFeeWalletTenantId();
    const receivingTenantId = txRow.depositReceivingTenantId ?? txRow.tenantId;
    const isFeeWalletDeposit = !!feeWalletTenantId && receivingTenantId === feeWalletTenantId;
    const expectedAmount = (payload.valueInCents ?? 0) / 100;

    // Grava o txid e marca PROCESSING antes do cross-check.
    await withAdmin((tx) =>
      tx.tenantDepixTransaction.updateMany({
        where: { id: txRow.id, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "PROCESSING", depositTxId: blockchainTxId, pixApprovedAt: new Date(), ...payerNamePatch(payload) },
      }),
    );

    // Cross-check on-chain (forca sync do LWK; exige >=2 conf + amount confere).
    // Split nativo: o on-chain chega LIQUIDO (bruto − taxa Arena − taxa Eulen), entao
    // a folga PRA BAIXO precisa cobrir a taxa Arena esperada, nao so a fixa da Eulen.
    const crossCheck = await verifyDepositOnChain({
      tenantId: receivingTenantId,
      txid: blockchainTxId,
      expectedAmount,
      expectedAddress: txRow.depositAddress ?? null,
      maxUnderpayCents: await depositUnderpayToleranceCents(
        receivingTenantId,
        payload.valueInCents ?? Math.round(expectedAmount * 100),
      ),
      // Teto curto: nao segurar o webhook alem do SLA da Eulen se o LWK travar.
      lwkTimeoutMs: WEBHOOK_LWK_CROSSCHECK_TIMEOUT_MS,
      // Le o cache do monitor (sem full_scan pesado) — o cross-check do webhook
      // nao pode segurar o SLA da Eulen no sync. Se a tx nao esta no cache, cai no
      // cron (rede de seguranca). Fase 3 do diag de timeout Eulen/LWK.
      lwkSync: false,
    });
    if (!crossCheck.ok) {
      // Ainda nao confirmado (broadcast recente) ou divergencia: NAO credita.
      // O monitor LWK + cron completam quando confirmar (rede de seguranca).
      await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
      logger.info("Eulen-deposit webhook: depix_sent ainda nao confirmado on-chain", {
        qrId,
        reason: crossCheck.reason,
      });
      return { status: 200, body: { ok: true, depixSent: true, awaitingConfirmation: true } };
    }

    try {
      const result = isFeeWalletDeposit
        ? await settleDepositViaFeeWallet({
            feeWalletTenantId: receivingTenantId,
            depositLabel: txRow.depositLabel ?? "",
            depositTxId: blockchainTxId,
            depixAmount: crossCheck.onchainAmount,
            confirmations: 2,
          })
        : await settleDepositConfirmed({
            tenantId: receivingTenantId,
            depositLabel: txRow.depositLabel ?? "",
            depositTxId: blockchainTxId,
            depixAmount: crossCheck.onchainAmount,
            confirmations: 2,
          });
      await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
      logger.info("Eulen-deposit webhook: deposito creditado via webhook", { qrId, id: txRow.id });
      return { status: 200, body: { ok: true, ...result } };
    } catch (err) {
      logger.error("Eulen-deposit webhook: settle erro", {
        qrId,
        err: err instanceof Error ? err.message : String(err),
      });
      await markWebhookProcessed("eulen_deposit", eventKey, { ok: false, errorMessage: String(err) });
      // 200: o monitor on-chain ainda completa.
      return { status: 200, body: { ok: true, error: "settle_failed_fallback_monitor" } };
    }
  }

  // ── Expirado / falho ──
  if (EXPIRED_STATUSES.has(statusRaw) || FAILED_STATUSES.has(statusRaw)) {
    const outcome = EXPIRED_STATUSES.has(statusRaw) ? "EXPIRED" : "FAILED";
    await withAdmin((tx) =>
      tx.tenantDepixTransaction.updateMany({
        // So finaliza quem ainda nao concluiu (nao reverte um COMPLETED).
        where: { id: txRow.id, status: { in: ["PENDING", "PROCESSING"] } },
        data: {
          status: outcome,
          completedAt: new Date(),
          errorMessage: outcome === "EXPIRED" ? "PIX expirou" : `Deposito ${statusRaw}`,
          apiResponse: payload as never,
        },
      }),
    );
    await propagateDepositNotPaid(qrId, outcome);
    await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
    return { status: 200, body: { ok: true, finalized: outcome } };
  }

  // pending / under_review / delayed: ack.
  await markWebhookProcessed("eulen_deposit", eventKey, { ok: true });
  return { status: 200, body: { ok: true, ignored: statusRaw } };
}
