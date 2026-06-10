/**
 * Métricas do Talison — eventos estruturados e agregáveis.
 *
 * Não há sistema de métricas dedicado; emitimos logs com um campo estável
 * `talisonMetric` pra agregar no tooling de logs (contar skips por motivo,
 * handoffs, falhas de entrega, respostas degradadas). É o mínimo pra tornar
 * "o bot não respondeu" visível sem auditoria manual no banco.
 */

import { logger } from "@/lib/logger";

export type TalisonMetric =
  | "replied"
  | "skipped"
  | "degraded"
  | "delivery_failed"
  | "suspicious_price"
  | "handoff"
  | "lead_qualified"
  | "hot_lead"
  | "abandoned_alert"
  | "wait_message"
  | "wait_skipped_closed"
  | "off_hours_notice"
  | "catchup_replied";

export function recordTalisonMetric(
  metric: TalisonMetric,
  fields: Record<string, unknown> = {},
): void {
  logger.info("talison.metric", { talisonMetric: metric, ...fields });
}
