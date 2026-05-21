/**
 * Tracking da janela de 24h do WhatsApp Cloud API.
 *
 * Meta so permite texto livre fora de templates DENTRO da janela de 24h apos
 * o cliente enviar mensagem para a loja. Fora dessa janela, e obrigatorio
 * usar template aprovado.
 *
 * Implementacao atual (conservadora): assume SEMPRE fora da janela. Isso
 * garante que toda mensagem outbound use template — funciona corretamente
 * desde que os templates estejam APPROVED na Meta. Quando o tracking real
 * (modelo WhatsAppConversation com lastInboundAt) for implementado, basta
 * substituir aqui.
 */

import { logger } from "@/lib/logger";

/**
 * Retorna true se a loja recebeu mensagem do telefone nas ultimas 24h.
 * Hoje retorna sempre `false` (forca template).
 */
export async function isWithin24hWindow(phone: string): Promise<boolean> {
  logger.debug("WhatsApp 24h-window check (stub: always outside)", { phone });
  return false;
}

/**
 * Marca que recebemos mensagem inbound do telefone (atualiza janela).
 * Hoje no-op; conectar quando o webhook Cloud API estiver implementado.
 */
export async function registerInboundMessage(_phone: string): Promise<void> {
  // TODO: implementar quando WhatsAppConversation existir
}
