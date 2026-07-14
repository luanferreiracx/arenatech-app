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

// ── Horário de atendimento (fuso, janela e dias) — consciência temporal do bot ──

/** Fusos comuns no Brasil, para o seletor da UI (rótulo → IANA). */
export const COMMON_TIMEZONES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "America/Sao_Paulo", label: "Brasília / São Paulo (BRT, UTC-3)" },
  { value: "America/Fortaleza", label: "Nordeste (Fortaleza/Teresina/Recife, UTC-3)" },
  { value: "America/Bahia", label: "Bahia (Salvador, UTC-3)" },
  { value: "America/Manaus", label: "Amazonas (Manaus, UTC-4)" },
  { value: "America/Cuiaba", label: "Mato Grosso (Cuiabá, UTC-4)" },
  { value: "America/Porto_Velho", label: "Rondônia (Porto Velho, UTC-4)" },
  { value: "America/Rio_Branco", label: "Acre (Rio Branco, UTC-5)" },
  { value: "America/Noronha", label: "Fernando de Noronha (UTC-2)" },
];

/** Defaults do sistema quando o tenant não configurou (espelham business-hours.ts). */
export const DEFAULT_BOT_TIMEZONE = "America/Fortaleza";
export const DEFAULT_BOT_OPEN_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6];

/** Rótulos dos dias da semana para a UI (índice 0=domingo). */
export const WEEKDAY_LABELS: ReadonlyArray<{ value: number; short: string; long: string }> = [
  { value: 0, short: "Dom", long: "Domingo" },
  { value: 1, short: "Seg", long: "Segunda" },
  { value: 2, short: "Ter", long: "Terça" },
  { value: 3, short: "Qua", long: "Quarta" },
  { value: 4, short: "Qui", long: "Quinta" },
  { value: 5, short: "Sex", long: "Sexta" },
  { value: 6, short: "Sáb", long: "Sábado" },
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Normaliza o valor de um campo de horário "HH:mm" vindo do form. NULL-SAFE de
 * propósito: o `setValueAs` do react-hook-form chama isto no reset com o valor CRU,
 * que é `null` quando a loja não tem horário configurado. Chamar `.trim()` num `null`
 * crashava o render inteiro da aba (error boundary "erro inesperado"). Vazio, espaços
 * ou não-string → null; senão devolve a string como está.
 */
export function normalizeHhmm(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Fuso IANA válido? Usa o próprio motor Intl como fonte da verdade. */
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const hhmmField = z
  .string()
  .regex(HHMM, "Use o formato HH:mm (ex.: 09:30).")
  .optional()
  .nullable();

/**
 * Schema do horário de atendimento do bot. `timezone` obrigatório e válido (IANA);
 * início/fim opcionais (HH:mm) — se um for informado, o outro também deve ser, e o
 * fim tem que ser depois do início; `openWeekdays` são dias 0=domingo … 6=sábado.
 */
export const updateBotScheduleSchema = z
  .object({
    timezone: z.string().refine(isValidTimeZone, "Fuso horário inválido."),
    start: hhmmField,
    end: hhmmField,
    openWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
  })
  .superRefine((value, ctx) => {
    const start = value.start?.trim() || null;
    const end = value.end?.trim() || null;
    if ((start && !end) || (!start && end)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [start ? "end" : "start"],
        message: "Informe abertura e fechamento juntos, ou deixe ambos em branco.",
      });
    }
    if (start && end) {
      const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
      if (toMin(end) <= toMin(start)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["end"],
          message: "O fechamento deve ser depois da abertura.",
        });
      }
    }
    if (new Set(value.openWeekdays).size !== value.openWeekdays.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["openWeekdays"], message: "Dias repetidos." });
    }
  });

export type UpdateBotScheduleInput = z.infer<typeof updateBotScheduleSchema>;
