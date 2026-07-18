/**
 * Sanitização de texto livre de uma única linha vindo de input EXTERNO (API de
 * parceiros: recipientName, description). Detecta/remove caracteres de controle e
 * marcas/overrides de direção BIDI, que habilitam injeção em log/CSV e spoofing de
 * exibição. Mantém letras/acentos normais.
 *
 * Ranges por code point (não caracteres literais) de propósito: o arquivo fica em
 * ASCII puro — revisável/diffável, não binário.
 */

// Faixas de code points proibidos:
//   C0 (0x00–0x1F), DEL/C1 (0x7F–0x9F),
//   BIDI: LRM/RLM (0x200E–0x200F), LRE..RLO (0x202A–0x202E), isolates (0x2066–0x2069).
const CONTROL_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x200e, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];

function isControlCode(code: number): boolean {
  return CONTROL_RANGES.some(([lo, hi]) => code >= lo && code <= hi);
}

/** Remove controles/BIDI e faz trim. Idempotente. */
export function stripControlChars(input: string): string {
  let out = "";
  for (const ch of input) {
    if (!isControlCode(ch.codePointAt(0) ?? 0)) out += ch;
  }
  return out.trim();
}

/** true se a string contém qualquer caractere de controle/BIDI (para rejeitar na
 *  borda com um 400 claro, em vez de mutar silenciosamente — mais adequado a API). */
export function hasControlChars(input: string): boolean {
  for (const ch of input) {
    if (isControlCode(ch.codePointAt(0) ?? 0)) return true;
  }
  return false;
}
