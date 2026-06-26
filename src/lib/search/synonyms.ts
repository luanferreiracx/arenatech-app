/**
 * Sinonimos de busca compartilhados — catalogo publico E bot Talison.
 *
 * Objetivo: busca mais ampla (cliente digita "fonte" e acha "carregador";
 * "fone" acha "headset") SEM espalhar listas divergentes. Antes essa lista
 * vivia so no catalogo (public-catalog.ts) e o bot nao tinha nenhuma — buscas
 * iguais davam resultados diferentes. Aqui ha UMA fonte da verdade.
 *
 * Decisao (2026-06-26): o catalogo da loja e de acessorios de celular — dominio
 * pequeno e estavel. Uma lista curada cobre bem; embeddings/pgvector seriam
 * complexidade cara para ganho marginal. Se o dominio crescer/virar
 * imprevisivel, reavaliar busca semantica (ver docs/05_PROGRESS.md).
 *
 * A lista NAO precisa ser exaustiva: a busca e hibrida — alem dos sinonimos,
 * o termo cru sempre roda no `contains` tradicional. Sinonimo so AMPLIA.
 */

/**
 * Mapa termo→sinonimos. Chaves SEM acento e em minusculas (a busca normaliza
 * a entrada antes do lookup). Cada lista inclui o proprio termo + variantes
 * (com/sem acento, ingles, gírias) e termos correlatos do mesmo "conceito".
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // ── Conectores / cabos / carregadores ──
  ["fonte", "carregador", "charger", "carregadores"],
  ["turbo", "rapido", "rápido", "fast", "20w", "25w", "30w", "33w", "40w", "65w", "ultra"],
  ["cabo", "cable", "cabos"],
  ["usb", "usb-c", "usb-a", "type-c", "tipo-c", "usbc"],
  ["lightning", "iphone", "apple"],
  ["thunderbolt", "usb-c", "type-c", "macbook"],

  // ── Audio ──
  ["fone", "fones", "headphone", "headphones", "headset", "earphone", "earbuds", "fone de ouvido", "auricular"],
  ["bluetooth", "wireless", "sem fio", "bt"],
  ["caixa de som", "speaker", "caixinha", "jbl", "bombox", "boombox"],

  // ── Protecao de tela / corpo ──
  ["pelicula", "película", "peliculas", "vidro", "protetor", "protetor de tela", "glass", "3d", "9d", "ceramica", "cerâmica"],
  ["capa", "capinha", "case", "cover", "capas", "capinhas", "bumper"],

  // ── Energia / armazenamento externo ──
  ["powerbank", "power bank", "carregador portatil", "carregador portátil", "bateria externa", "powerbanks"],
  ["pendrive", "pen drive", "flash drive", "pen-drive", "usb stick"],
  ["cartao", "cartão", "memoria", "memória", "sd", "microsd", "micro sd", "cartao de memoria", "cartão de memória"],
  ["hd", "ssd", "disco", "armazenamento", "hd externo", "ssd externo"],

  // ── Perifericos ──
  ["mouse", "mouses", "rato"],
  ["teclado", "keyboard", "teclados"],
  ["suporte", "stand", "tripe", "tripé", "holder", "apoio"],

  // ── Relogios / vestiveis ──
  ["relogio", "relógio", "smartwatch", "watch", "smart watch", "relogios", "relógios"],
  ["pulseira", "pulseiras", "bracelete", "correia", "strap"],

  // ── Marcas / plataformas (ajudam a achar acessorios compativeis) ──
  ["iphone", "apple", "ios"],
  ["ipad", "apple"],
  ["samsung", "galaxy"],
  ["xiaomi", "redmi", "poco"],
  ["android", "samsung", "xiaomi", "motorola"],
];

/**
 * Indice termo→sinonimos derivado dos grupos. Cada termo do grupo aponta para
 * a UNIAO de todos os termos do(s) grupo(s) em que aparece (sinonimia e
 * transitiva: se "fone"~"headset" e o mesmo grupo tem "earbuds", todos se
 * acham entre si). Construido uma vez no load do modulo.
 */
const SYNONYM_INDEX: Map<string, Set<string>> = (() => {
  const index = new Map<string, Set<string>>();
  for (const group of SYNONYM_GROUPS) {
    for (const term of group) {
      const key = normalizeTerm(term);
      const bucket = index.get(key) ?? new Set<string>();
      for (const other of group) bucket.add(other);
      index.set(key, bucket);
    }
  }
  return index;
})();

/** Minuscula + remove acentos (NFD) para casar "pelicula"/"película". */
export function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .normalize("NFD")
    // Combining Diacritical Marks (U+0300–U+036F): os acentos separados pelo NFD.
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Expande UMA palavra para ela + seus sinonimos. Sempre inclui o termo
 * original (cru, sem normalizar) para nao perder a forma que o cliente digitou.
 * Sem sinonimos cadastrados, devolve so o proprio termo.
 */
export function expandWord(word: string): string[] {
  const key = normalizeTerm(word);
  const synonyms = SYNONYM_INDEX.get(key);
  if (!synonyms) return [word];
  // Set garante unicidade; inclui o termo original (pode diferir em acento/caixa).
  return Array.from(new Set([word, ...synonyms]));
}

/**
 * Quebra uma busca em palavras significativas (>= 2 chars). Espelha o
 * comportamento antigo do catalogo e do bot — uma so funcao agora.
 */
export function searchWords(input: string): string[] {
  return input
    .trim()
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 2);
}

/**
 * Para cada palavra da busca, devolve a lista expandida (palavra + sinonimos).
 * O consumidor monta o WHERE: por palavra, casa QUALQUER sinonimo (OR); entre
 * palavras, exige todas (AND) — mesma semantica das implementacoes atuais.
 */
export function expandSearchWords(input: string): string[][] {
  return searchWords(input).map(expandWord);
}
