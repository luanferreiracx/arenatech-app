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
  /** Resposta montou equação em dinheiro sem `simular_parcelamento` ter rodado. */
  | "computed_math"
  | "handoff"
  | "lead_qualified"
  | "hot_lead"
  | "abandoned_alert"
  | "wait_message"
  | "wait_skipped_closed"
  | "off_hours_notice"
  | "catchup_replied"
  // TL-1: consumo de tokens por conversa. O provider já devolvia `usage` e
  // ninguém lia — num módulo com 12 mil mensagens só em julho, o custo do bot era
  // invisível. Emitido como log estruturado, igual às demais: o tooling de log
  // agrega por dia/tenant sem precisar de sistema de métricas dedicado.
  | "tokens";

export function recordTalisonMetric(
  metric: TalisonMetric,
  fields: Record<string, unknown> = {},
): void {
  logger.info("talison.metric", { talisonMetric: metric, ...fields });
}
