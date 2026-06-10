/**
 * Consciência temporal do Talison.
 *
 * O modelo não sabe que horas são (e seu conhecimento é desatualizado), então
 * erra sobre horário de funcionamento ("estamos abertos agora?"). Aqui o CÓDIGO
 * calcula a data/hora atual em Teresina/PI (America/Fortaleza) e se a loja está
 * aberta, e entrega isso pronto pro prompt — dado, não palpite.
 */

const TIMEZONE = "America/Fortaleza";

/** Horário comercial padrão quando o tenant não configurou (seg–sáb, 09h30–20h). */
const DEFAULT_OPEN_MINUTES = 9 * 60 + 30;
const DEFAULT_CLOSE_MINUTES = 20 * 60;

const WEEKDAY_PT: Record<string, string> = {
  Sun: "domingo",
  Mon: "segunda-feira",
  Tue: "terça-feira",
  Wed: "quarta-feira",
  Thu: "quinta-feira",
  Fri: "sexta-feira",
  Sat: "sábado",
};

export type BusinessHoursConfig = {
  /** "HH:mm" — início configurado, se houver. */
  start?: string | null;
  /** "HH:mm" — fim configurado, se houver. */
  end?: string | null;
};

/** Extrai os campos de data/hora em America/Fortaleza, independente do TZ do servidor. */
function nowPartsInTeresina(now: Date): {
  weekdayKey: string;
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  ) as Record<string, string | undefined>;
  // hour "24" aparece à meia-noite em alguns runtimes; normaliza pra "00".
  const hour = parts.hour === "24" ? "00" : parts.hour ?? "00";
  return {
    weekdayKey: parts.weekday ?? "",
    day: parts.day ?? "",
    month: parts.month ?? "",
    year: parts.year ?? "",
    hour,
    minute: parts.minute ?? "00",
  };
}

function parseHHmm(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Monta a nota de "agora" pro system prompt: data/hora local + aberto/fechado.
 * Domingo é considerado fechado no padrão; horário configurado tem precedência.
 */
export function buildNowNote(
  config: BusinessHoursConfig = {},
  now: Date = new Date(),
): string {
  const { weekdayKey, day, month, year, hour, minute } = nowPartsInTeresina(now);
  const weekday = WEEKDAY_PT[weekdayKey] ?? weekdayKey;
  const nowMinutes = Number(hour) * 60 + Number(minute);

  const openMinutes = parseHHmm(config.start) ?? DEFAULT_OPEN_MINUTES;
  const closeMinutes = parseHHmm(config.end) ?? DEFAULT_CLOSE_MINUTES;
  const isSunday = weekdayKey === "Sun";
  const isOpen = !isSunday && nowMinutes >= openMinutes && nowMinutes < closeMinutes;

  const hhmm = (total: number) =>
    `${String(Math.floor(total / 60)).padStart(2, "0")}h${total % 60 ? String(total % 60).padStart(2, "0") : ""}`;
  const hoursLabel = `${hhmm(openMinutes)}–${hhmm(closeMinutes)}`;

  return (
    `AGORA: ${weekday}, ${day}/${month}/${year}, ${hour}:${minute} (horário de Teresina/PI). ` +
    `A loja está ${isOpen ? "ABERTA" : "FECHADA"} neste momento` +
    `${config.start || config.end ? "" : ` (funcionamento padrão: seg–sáb, ${hoursLabel})`}. ` +
    `Use esta informação se o cliente perguntar de horário/dia; não calcule data nem invente.`
  );
}
