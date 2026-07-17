/**
 * FONTE ÚNICA da semântica dos status de DEPÓSITO da Eulen.
 *
 * Antes, o conhecimento "qual string de status da Eulen significa o quê" vivia
 * espalhado em 4 lugares (a normalização do polling, o handler do webhook, o handler
 * do QR estático e o gate de notificação da rota) — cada um com seus próprios Sets.
 * Uma mudança da Eulen (ex.: o novo `delayed` do delay de 24h) exigia lembrar de
 * atualizar TODOS. Aqui a knowledge fica concentrada: os callers só perguntam
 * "isto é PIX recebido? DePix on-chain? expirado?" — sem repetir as strings cruas.
 *
 * Referência: docs.eulen.app (deposit-status). Classes:
 *  - pix_received : `approved` | `delayed` — o cliente PAGOU (libera a venda). O
 *                   `delayed` é a retenção de ~24h da Eulen (delayUntil): o PIX já
 *                   caiu, só o DePix é segurado. NÃO credita saldo aqui.
 *  - depix_sent   : `depix_sent` — o DePix foi enviado on-chain (credita saldo).
 *  - expired      : `expired` — QR venceu sem pagamento.
 *  - refunded     : `refunded` | `will_refund` — devolvido ao pagador.
 *  - failed       : `canceled`/`cancelled` | `error` — falha terminal.
 *  - pending      : `pending` | `under_review` (a Eulen ainda revisa o pagamento).
 */

export type DepositStatusClass =
  | "pix_received"
  | "depix_sent"
  | "expired"
  | "refunded"
  | "failed"
  | "pending";

const CLASS_BY_RAW: Record<string, DepositStatusClass> = {
  approved: "pix_received",
  delayed: "pix_received",
  depix_sent: "depix_sent",
  expired: "expired",
  refunded: "refunded",
  will_refund: "refunded",
  canceled: "failed",
  cancelled: "failed",
  error: "failed",
  pending: "pending",
  under_review: "pending",
};

/** Classe semântica de um status cru da Eulen. Desconhecido -> "pending" (seguro:
 *  não libera venda nem credita). Case-insensitive. */
export function classifyDepositStatus(raw: string | null | undefined): DepositStatusClass {
  return CLASS_BY_RAW[(raw ?? "").toLowerCase()] ?? "pending";
}

/** PIX recebido = o cliente pagou (libera a venda). Inclui `delayed` (delay 24h). */
export const isPixReceivedStatus = (raw: string | null | undefined): boolean =>
  classifyDepositStatus(raw) === "pix_received";

/** DePix enviado on-chain = credita saldo (COMPLETED). */
export const isDepixSentStatus = (raw: string | null | undefined): boolean =>
  classifyDepositStatus(raw) === "depix_sent";

/** QR expirou sem pagamento. */
export const isExpiredStatus = (raw: string | null | undefined): boolean =>
  classifyDepositStatus(raw) === "expired";

/** Devolvido ao pagador. */
export const isRefundedStatus = (raw: string | null | undefined): boolean =>
  classifyDepositStatus(raw) === "refunded";

/** Falha terminal (cancelado/erro). */
export const isFailedStatus = (raw: string | null | undefined): boolean =>
  classifyDepositStatus(raw) === "failed";

/** Terminal de "não pago" (expirado/cancelado/erro/devolvido) — usado pelos handlers
 *  que propagam `not paid` (a distinção expired vs failed vs refunded é do caller). */
export const isDepositNotPaidTerminal = (raw: string | null | undefined): boolean => {
  const c = classifyDepositStatus(raw);
  return c === "expired" || c === "failed" || c === "refunded";
};
