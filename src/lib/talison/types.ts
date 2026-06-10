/**
 * Talison IA — tipos compartilhados do agente de atendimento.
 *
 * O agente conversa via um LlmProvider (DeepSeek por padrão) e enxerga
 * imagens via um VisionProvider (Claude). Esses tipos são o contrato entre
 * o loop do agente, as tools e os providers — propositalmente independentes
 * do SDK concreto, pra trocar de modelo sem reescrever o agente.
 */

/** Papel de uma mensagem na conversa com o modelo. */
export type LlmRole = "system" | "user" | "assistant" | "tool";

/** Uma chamada de tool que o modelo pediu (uma rodada pode ter várias). */
export type LlmToolCall = {
  /** Id da chamada — usado pra casar o resultado de volta. */
  id: string;
  name: string;
  /** Argumentos já parseados do JSON que o modelo emitiu. */
  arguments: Record<string, unknown>;
};

/** Mensagem trocada com o modelo. */
export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

/** Definição de uma tool exposta ao modelo (schema JSON dos parâmetros). */
export type LlmToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema dos parâmetros (subset suportado pela OpenAI tool spec). */
  parameters: Record<string, unknown>;
};

/** Resposta do modelo numa rodada: ou texto final, ou pedidos de tool. */
export type LlmCompletion = {
  /** Texto da resposta (pode coexistir com toolCalls em alguns modelos). */
  text: string;
  toolCalls: LlmToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
};

/** Provider de conversa (DeepSeek por padrão). */
export type LlmProvider = {
  readonly name: string;
  chat(args: {
    messages: LlmMessage[];
    tools?: LlmToolDefinition[];
    maxTokens?: number;
  }): Promise<LlmCompletion>;
};

/** Provider de visão (Claude) — descreve uma imagem em texto. */
export type VisionProvider = {
  readonly name: string;
  /** Recebe a URL da imagem + um hint de contexto, devolve descrição textual. */
  describe(args: { imageUrl: string; prompt?: string }): Promise<string>;
};

/** Provider de transcrição de áudio (Groq Whisper) — áudio do cliente → texto. */
export type AudioProvider = {
  readonly name: string;
  /** Recebe a URL do áudio (ogg/opus do WhatsApp), devolve a transcrição. */
  transcribe(args: { audioUrl: string }): Promise<string>;
};
