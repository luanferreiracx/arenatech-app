/**
 * Quanto fôlego de gás resta na carteira central.
 *
 * Toda transação Liquid paga fee de rede em L-BTC, e é a central que abastece os
 * demais tenants (`ensureLbtcFor`). Se ela seca, ninguém saca: o erro que chega
 * ao lojista é "Saque temporariamente indisponível", que mente — não é
 * temporário e nada se recupera sozinho.
 *
 * Mora aqui, puro e isolado, pelo mesmo motivo de `daily-cap.ts`: é a regra que
 * decide quando alguém é avisado, e testá-la não pode depender de subir LWK e
 * Prisma.
 *
 * ## Por que um aviso ANTES do piso (2026-08-02)
 *
 * O piso era o único limiar, e alarme no piso não dá tempo de reagir: quando
 * dispara, o próximo tenant que tentar sacar já falha. Medido em produção neste
 * dia: 10.328 sats contra um piso de 10.000 — 3% de margem, dois refills de
 * fôlego, e nenhum aviso porque ainda estava tecnicamente acima. Abrir cadastro
 * de clientes nesse estado é agendar a falha para o terceiro cliente.
 *
 * O número que interessa a quem opera não é o saldo em sats, é quantos refills
 * ele ainda cobre.
 */

/** Abaixo de quantos refills o aviso antecipado dispara. */
export const LBTC_WARNING_REFILLS = 4;

export type LbtcRunwayLevel = "ok" | "warning" | "critical";

export type LbtcRunway = {
  /** Quantos refills completos o saldo atual ainda cobre. */
  refillsCovered: number;
  level: LbtcRunwayLevel;
  floorSats: number;
  warningSats: number;
};

/**
 * Classifica o fôlego da central.
 *
 * `critical` (abaixo do piso) mantém o comportamento antigo: é incidente, os
 * repasses já estão em risco. `warning` é o degrau novo — ainda dá para operar,
 * mas já é hora de abastecer.
 *
 * O número de carteiras NÃO entra no limiar de propósito. Exigir um refill por
 * carteira provisionada trataria como emergência uma frota grande e parada, e o
 * alarme que grita sem motivo é o que ninguém lê quando importa. A contagem
 * entra na MENSAGEM, que é onde ela ajuda a decidir quanto abastecer.
 */
export function evaluateLbtcRunway(args: {
  balanceSats: number;
  refillSats: number;
  floorSats: number;
  warningRefills?: number;
}): LbtcRunway {
  const { balanceSats, refillSats, floorSats } = args;
  const warningRefills = args.warningRefills ?? LBTC_WARNING_REFILLS;

  // Refill inválido (env zerada por engano) tornaria a divisão inútil. Sem uma
  // referência de refill não há como falar em fôlego: reporta só contra o piso.
  if (!Number.isFinite(refillSats) || refillSats <= 0) {
    return {
      refillsCovered: 0,
      level: balanceSats < floorSats ? "critical" : "ok",
      floorSats,
      warningSats: floorSats,
    };
  }

  const warningSats = Math.max(floorSats, warningRefills * refillSats);
  const refillsCovered = Math.floor(balanceSats / refillSats);

  const level: LbtcRunwayLevel =
    balanceSats < floorSats ? "critical" : balanceSats < warningSats ? "warning" : "ok";

  return { refillsCovered, level, floorSats, warningSats };
}
