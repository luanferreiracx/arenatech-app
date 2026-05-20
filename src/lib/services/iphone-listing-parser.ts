/**
 * Parser de mensagens de grupos WhatsApp para extrair anúncios de iPhone.
 *
 * Estratégia: regex + keywords. Pura, sem I/O. Retorna null quando a mensagem
 * não satisfaz os critérios mínimos (modelo identificável + presença de caixa).
 */

export type IPhoneCondition = "LACRADO" | "SEMINOVO_CAIXA" | "SEMINOVO";

export interface ParsedIPhoneListing {
  model: string;
  storageGb: number | null;
  color: string | null;
  priceCents: number | null;
  hasBox: boolean;
  condition: IPhoneCondition;
  rawSnippet: string;
}

const MODEL_REGEX =
  /iphone\s*(se\s*(?:2|3|2022|2020)?|x[rs]?\s*max?|x\s*max|x|1[0-7])\s*(pro\s*max|pro|plus|mini|pm|p)?/i;

const STORAGE_REGEX = /(\b|[^0-9])(64|128|256|512)\s*(gb|gigas?)?(\b|[^0-9])|(1)\s*(tb)/i;
// Procura primeiro padrões com R$ ou marcador explícito; senão, números soltos plausíveis.
// O `(?!\d)` no final evita capturar prefixos de números maiores (ex.: "100000" → não pega "10000").
const PRICE_WITH_PREFIX_REGEX =
  /(?:r\$|preço|preco|valor)\s*\$?\s*(\d{1,3}(?:[.\s]\d{3})+|\d{3,5})(?:\s*,\s*(\d{2}))?(?!\d)/i;
const PRICE_LOOSE_REGEX =
  /(?:^|\s)(\d{1,3}(?:[.\s]\d{3})+|\d{3,5})(?:\s*,\s*(\d{2}))?(?!\d)/;

const BOX_POSITIVE = /\b(caixa|lacrad[oa]|cx|na\s*cx|c\/\s*caixa|com\s*caixa)\b/i;
const BOX_NEGATIVE = /\b(sem\s*caixa|s\/\s*caixa|sem\s*cx|s\/\s*cx)\b/i;
const SEALED_REGEX = /\b(lacrad[oa]|sealed|0\s*km|zero\s*km)\b/i;
const SECOND_HAND_REGEX = /\b(seminovo|semi\s*novo|usado|de\s*segunda)\b/i;

const COLOR_REGEX =
  /\b(preto|black|grafite|graphite|branco|white|prata|silver|gold|dourad[oa]|rose|rosa|azul|blue|verde|green|roxo|purple|vermelho|red|midnight|starlight|natural)\b/i;

/**
 * Normaliza o modelo extraído para forma canônica.
 * Exemplos:
 *   "iphone 13" → "iPhone 13"
 *   "iphone 13 pm" → "iPhone 13 Pro Max"
 *   "iphone xs max" → "iPhone XS Max"
 *   "iphone se 2" → "iPhone SE 2"
 */
function normalizeModel(baseMatch: string, suffixMatch: string | undefined): string {
  const base = baseMatch.trim().toLowerCase();
  const suffix = suffixMatch?.trim().toLowerCase();

  let canonicalBase: string;
  if (base.startsWith("se")) {
    const gen = base.replace(/[^0-9]/g, "");
    canonicalBase = gen ? `SE ${gen}` : "SE";
  } else if (base.startsWith("x")) {
    // xr, xs, xs max, x max, x
    if (base.includes("max")) canonicalBase = "XS Max";
    else if (base === "xr") canonicalBase = "XR";
    else if (base === "xs") canonicalBase = "XS";
    else canonicalBase = "X";
  } else {
    canonicalBase = base.replace(/\D/g, "");
  }

  let canonicalSuffix = "";
  if (suffix) {
    if (suffix === "pm" || suffix.startsWith("pro max") || suffix === "p")
      canonicalSuffix = "Pro Max";
    else if (suffix === "pro") canonicalSuffix = "Pro";
    else if (suffix === "plus") canonicalSuffix = "Plus";
    else if (suffix === "mini") canonicalSuffix = "Mini";
  }

  return canonicalSuffix
    ? `iPhone ${canonicalBase} ${canonicalSuffix}`
    : `iPhone ${canonicalBase}`;
}

function extractStorage(text: string): number | null {
  const match = STORAGE_REGEX.exec(text);
  if (!match) return null;
  if (match[5] === "1" && match[6]?.toLowerCase() === "tb") return 1024;
  const value = match[2];
  return value ? parseInt(value, 10) : null;
}

/**
 * Converte string de preço para centavos. Plausibilidade: R$ 500–15.000.
 * Aceita: "1500", "1.500", "1500,00", "R$ 1.500,00", "1 500".
 */
function tryExtractFromMatch(match: RegExpExecArray | null): number | null {
  if (!match) return null;
  const intPart = match[1]?.replace(/[.\s]/g, "");
  const decPart = match[2] ?? "00";
  if (!intPart) return null;
  const reais = parseInt(intPart, 10);
  if (Number.isNaN(reais) || reais < 500 || reais > 15000) return null;
  const cents = parseInt(decPart.padEnd(2, "0").slice(0, 2), 10);
  return reais * 100 + (Number.isNaN(cents) ? 0 : cents);
}

function extractPriceCents(text: string): number | null {
  // Remove menções de storage ("128gb", "256 gb", "1tb") antes de procurar preço,
  // para evitar capturar o número do storage como valor.
  const cleaned = text.replace(/\b\d+\s*(gb|tb|gigas?)\b/gi, " ");
  const prefixed = PRICE_WITH_PREFIX_REGEX.exec(cleaned);
  const valueFromPrefix = tryExtractFromMatch(prefixed);
  if (valueFromPrefix !== null) return valueFromPrefix;
  return tryExtractFromMatch(PRICE_LOOSE_REGEX.exec(cleaned));
}

function extractColor(text: string): string | null {
  const match = COLOR_REGEX.exec(text);
  return match?.[1]?.toLowerCase() ?? null;
}

function hasBox(text: string): boolean {
  if (BOX_NEGATIVE.test(text)) return false;
  return BOX_POSITIVE.test(text);
}

function detectCondition(text: string, withBox: boolean): IPhoneCondition {
  if (SEALED_REGEX.test(text)) return "LACRADO";
  if (SECOND_HAND_REGEX.test(text) && withBox) return "SEMINOVO_CAIXA";
  if (withBox) return "SEMINOVO_CAIXA";
  return "SEMINOVO";
}

function truncate(text: string, max = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * Parse principal. Retorna null se:
 *   - não encontrar modelo
 *   - não houver indicação positiva de caixa (ou houver negação explícita)
 */
export function parseIPhoneListing(body: string): ParsedIPhoneListing | null {
  if (!body || body.length < 6) return null;

  const modelMatch = MODEL_REGEX.exec(body);
  if (!modelMatch) return null;

  const baseMatch = modelMatch[1];
  const suffixMatch = modelMatch[2];
  if (!baseMatch) return null;

  const withBox = hasBox(body);
  if (!withBox) return null;

  const model = normalizeModel(baseMatch, suffixMatch);
  const storageGb = extractStorage(body);
  const color = extractColor(body);
  const priceCents = extractPriceCents(body);
  const condition = detectCondition(body, withBox);

  return {
    model,
    storageGb,
    color,
    priceCents,
    hasBox: withBox,
    condition,
    rawSnippet: truncate(body),
  };
}

/**
 * Lista canônica de modelos suportados pela UI (para o dropdown de busca).
 * Cobre o range comercializado nos grupos REVENDA hoje.
 */
export const SUPPORTED_MODELS = [
  "iPhone SE",
  "iPhone SE 2",
  "iPhone SE 3",
  "iPhone X",
  "iPhone XR",
  "iPhone XS",
  "iPhone XS Max",
  "iPhone 11",
  "iPhone 11 Pro",
  "iPhone 11 Pro Max",
  "iPhone 12 Mini",
  "iPhone 12",
  "iPhone 12 Pro",
  "iPhone 12 Pro Max",
  "iPhone 13 Mini",
  "iPhone 13",
  "iPhone 13 Pro",
  "iPhone 13 Pro Max",
  "iPhone 14",
  "iPhone 14 Plus",
  "iPhone 14 Pro",
  "iPhone 14 Pro Max",
  "iPhone 15",
  "iPhone 15 Plus",
  "iPhone 15 Pro",
  "iPhone 15 Pro Max",
  "iPhone 16",
  "iPhone 16 Plus",
  "iPhone 16 Pro",
  "iPhone 16 Pro Max",
  "iPhone 17",
  "iPhone 17 Pro",
  "iPhone 17 Pro Max",
] as const;
