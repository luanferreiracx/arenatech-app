/**
 * Consciência temporal do Talison — por tenant.
 *
 * O modelo não sabe que horas são (e seu conhecimento é desatualizado), então
 * erra sobre horário de funcionamento ("estamos abertos agora?"). Aqui o CÓDIGO
 * calcula a data/hora atual no FUSO da loja e se ela está aberta, e entrega isso
 * pronto pro prompt — dado, não palpite.
 *
 * Multi-tenant: fuso, janela de horário e dias de funcionamento vêm da config do
 * tenant (ChatbotConfig). Os defaults abaixo são só o fallback do sistema quando o
 * tenant não configurou — nunca o fuso/horário de uma loja específica no bot de outra.
 */

/** Fallback de fuso quando o tenant não configurou (BR é UTC-3). */
const DEFAULT_TIMEZONE = "America/Fortaleza";
/** Janela padrão do sistema quando o tenant não informou horário (seg–sáb, 09h30–20h). */
const DEFAULT_OPEN_MINUTES = 9 * 60 + 30;
const DEFAULT_CLOSE_MINUTES = 20 * 60;
const DEFAULT_OPEN_WEEKDAYS = [1, 2, 3, 4, 5, 6];

/** Chave curta do Intl (en-US) → índice 0=domingo … 6=sábado. */
const WEEKDAY_INDEX_BY_KEY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const WEEKDAY_PT: Record<string, string> = {
  Sun: "domingo",
  Mon: "segunda-feira",
  Tue: "terça-feira",
  Wed: "quarta-feira",
  Thu: "quinta-feira",
  Fri: "sexta-feira",
  Sat: "sábado",
};

/** Nome curto de cada dia (índice 0=domingo) para montar o rótulo da janela. */
const WEEKDAY_SHORT_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export type BusinessHoursConfig = {
  /** Fuso IANA da loja (ex.: "America/Sao_Paulo"). */
  timezone?: string | null;
  /** "HH:mm" — início configurado, se houver. */
  start?: string | null;
  /** "HH:mm" — fim configurado, se houver. */
  end?: string | null;
  /** Dias abertos (0=domingo … 6=sábado). Vazio/ausente usa o default do sistema. */
  openWeekdays?: number[] | null;
};

function resolveTimezone(config: BusinessHoursConfig): string {
  const tz = config.timezone?.trim();
  return tz && tz.length > 0 ? tz : DEFAULT_TIMEZONE;
}

function resolveOpenWeekdays(config: BusinessHoursConfig): number[] {
  const days = config.openWeekdays?.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return days && days.length > 0 ? days : DEFAULT_OPEN_WEEKDAYS;
}

/** Extrai os campos de data/hora no fuso da loja, independente do TZ do servidor. */
function nowPartsInZone(
  now: Date,
  timezone: string,
): { weekdayKey: string; day: string; month: string; year: string; hour: string; minute: string } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
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

function fmtMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}h${total % 60 ? String(total % 60).padStart(2, "0") : ""}`;
}

/** Rótulo dos dias abertos: "segunda a sábado", "todos os dias" ou uma lista. */
function dayName(index: number): string {
  return WEEKDAY_SHORT_PT[index] ?? "";
}

function weekdaysLabel(openWeekdays: number[]): string {
  const sorted = [...new Set(openWeekdays)].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  if (sorted.length === 7) return "todos os dias";
  const isContiguous = sorted.every((day, index) => index === 0 || day === (sorted[index - 1] ?? -2) + 1);
  if (isContiguous && sorted.length > 1) {
    return `${dayName(sorted[0]!)} a ${dayName(sorted[sorted.length - 1]!)}`;
  }
  return sorted.map(dayName).join(", ");
}

/** Texto padrão da janela de atendimento, pra mensagens fixas. */
export function businessHoursLabel(config: BusinessHoursConfig = {}): string {
  const openMinutes = parseHHmm(config.start) ?? DEFAULT_OPEN_MINUTES;
  const closeMinutes = parseHHmm(config.end) ?? DEFAULT_CLOSE_MINUTES;
  return `${weekdaysLabel(resolveOpenWeekdays(config))}, das ${fmtMinutes(openMinutes)} às ${fmtMinutes(closeMinutes)}`;
}

/**
 * A loja está aberta agora? (no fuso da loja; dias e janela configuráveis; horário
 * configurado tem precedência sobre o default do sistema). Usado pelo runner e pelo cron.
 */
export function isStoreOpen(config: BusinessHoursConfig = {}, now: Date = new Date()): boolean {
  const { weekdayKey, hour, minute } = nowPartsInZone(now, resolveTimezone(config));
  const nowMinutes = Number(hour) * 60 + Number(minute);
  const openMinutes = parseHHmm(config.start) ?? DEFAULT_OPEN_MINUTES;
  const closeMinutes = parseHHmm(config.end) ?? DEFAULT_CLOSE_MINUTES;
  const openToday = resolveOpenWeekdays(config).includes(WEEKDAY_INDEX_BY_KEY[weekdayKey] ?? -1);
  return openToday && nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

/**
 * Monta a nota de "agora" pro system prompt: data/hora local + aberto/fechado.
 * Fuso, dias e janela vêm da config do tenant.
 */
export function buildNowNote(config: BusinessHoursConfig = {}, now: Date = new Date()): string {
  const timezone = resolveTimezone(config);
  const { weekdayKey, day, month, year, hour, minute } = nowPartsInZone(now, timezone);
  const weekday = WEEKDAY_PT[weekdayKey] ?? weekdayKey;
  const nowMinutes = Number(hour) * 60 + Number(minute);

  const openWeekdays = resolveOpenWeekdays(config);
  const openMinutes = parseHHmm(config.start) ?? DEFAULT_OPEN_MINUTES;
  const closeMinutes = parseHHmm(config.end) ?? DEFAULT_CLOSE_MINUTES;
  const openToday = openWeekdays.includes(WEEKDAY_INDEX_BY_KEY[weekdayKey] ?? -1);
  const isOpen = openToday && nowMinutes >= openMinutes && nowMinutes < closeMinutes;

  const configuredHours = Boolean(config.start || config.end);
  const hoursHint = configuredHours
    ? ""
    : ` (funcionamento padrão: ${weekdaysLabel(openWeekdays)}, ${fmtMinutes(openMinutes)}–${fmtMinutes(closeMinutes)})`;

  return (
    `AGORA: ${weekday}, ${day}/${month}/${year}, ${hour}:${minute} (horário local da loja). ` +
    `A loja está ${isOpen ? "ABERTA" : "FECHADA"} neste momento${hoursHint}. ` +
    `Use esta informação se o cliente perguntar de horário/dia; não calcule data nem invente.`
  );
}
