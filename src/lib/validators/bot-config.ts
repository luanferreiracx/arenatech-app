import { z } from "zod";

/** Cap do texto das instruções (ADR 0055). Entra no prompt de TODA conversa. */
export const BOT_INSTRUCTIONS_MAX_CHARS = 4000;

/**
 * Padrões óbvios de PROMPT INJECTION no texto do admin (M4 da revisão do ADR 0055).
 * Não é à prova de tudo — a defesa principal é arquitetural (bloco delimitado como
 * DADO + reafirmação das guardas por último em prompt.ts). Isto barra o óbvio e educa
 * o admin: o texto da loja é conhecimento/política, não comando de sistema.
 */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(as|todas as|the|all)?\s*(regras|instru[çc][õo]es|rules|instructions|previous|anteriores)/i,
  /desconsidere\s+(as|todas|o|a)/i,
  /esque[çc]a\s+(as|tudo|todas)/i,
  /voc[êe]\s+agora\s+[ée]/i,
  /a\s+partir\s+de\s+agora\s+voc[êe]/i,
  /system\s*prompt/i,
  /prompt\s+de\s+sistema/i,
  /act\s+as\b/i,
  /aja\s+como\b/i,
  /finja\s+(que|ser)/i,
  /jailbreak/i,
  /\bDAN\b/,
];

/** Retorna a 1ª frase suspeita encontrada, ou null se limpo. */
function findInjectionPattern(text: string): string | null {
  for (const pattern of INJECTION_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return null;
}

/**
 * Schema de atualização das instruções do bot. `enabled=false` desliga; `enabled=true`
 * exige texto não-vazio dentro do cap e sem padrão óbvio de injeção.
 */
export const updateBotConfigSchema = z
  .object({
    enabled: z.boolean(),
    instructions: z.string().max(BOT_INSTRUCTIONS_MAX_CHARS).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.enabled) return;
    const text = value.instructions?.trim() ?? "";
    if (text.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["instructions"],
        message: "Informe as instruções da loja para habilitar.",
      });
      return;
    }
    const suspicious = findInjectionPattern(text);
    if (suspicious) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["instructions"],
        message: `As instruções são conhecimento da loja, não comandos ao sistema. Remova trechos como "${suspicious}".`,
      });
    }
  });

export type UpdateBotConfigInput = z.infer<typeof updateBotConfigSchema>;
