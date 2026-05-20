/**
 * Validação de chave de acesso NF-e/NFC-e (44 dígitos).
 *
 * Estrutura:
 *  - cUF: 2 dígitos (código IBGE estado)
 *  - AAMM: 4 dígitos (ano + mês emissão)
 *  - CNPJ: 14 dígitos
 *  - mod: 2 dígitos (55=NF-e, 65=NFC-e)
 *  - serie: 3 dígitos
 *  - nNF: 9 dígitos (número da nota)
 *  - tpEmis: 1 dígito
 *  - cNF: 8 dígitos (código numérico)
 *  - cDV: 1 dígito (DV mod 11)
 *
 * Paridade Laravel `NfeImportService::validarChaveAcesso`.
 */

const NFE_KEY_REGEX = /^\d{44}$/;

export function isValidNfeKey(key: string): boolean {
  if (!key || !NFE_KEY_REGEX.test(key)) return false;
  return computeMod11Dv(key.slice(0, 43)) === Number(key[43]);
}

/**
 * Calcula o DV de uma chave de 43 dígitos usando algoritmo Mod 11
 * com pesos cíclicos de 2 a 9.
 */
export function computeMod11Dv(base43: string): number {
  if (!/^\d{43}$/.test(base43)) {
    throw new Error("base43 deve ter exatamente 43 dígitos numéricos");
  }
  const weights = [2, 3, 4, 5, 6, 7, 8, 9];
  let sum = 0;
  for (let i = 0; i < 43; i++) {
    const digit = Number(base43[42 - i]);
    sum += digit * (weights[i % 8] ?? 0);
  }
  const remainder = sum % 11;
  const dv = 11 - remainder;
  return dv >= 10 ? 0 : dv;
}

export interface NfeKeyParts {
  cUF: string;
  ano: string;
  mes: string;
  cnpj: string;
  modelo: string;
  serie: string;
  numero: string;
  tpEmis: string;
  cNF: string;
  cDV: string;
}

export function parseNfeKey(key: string): NfeKeyParts | null {
  if (!isValidNfeKey(key)) return null;
  return {
    cUF: key.slice(0, 2),
    ano: key.slice(2, 4),
    mes: key.slice(4, 6),
    cnpj: key.slice(6, 20),
    modelo: key.slice(20, 22),
    serie: key.slice(22, 25),
    numero: key.slice(25, 34),
    tpEmis: key.slice(34, 35),
    cNF: key.slice(35, 43),
    cDV: key.slice(43, 44),
  };
}
