/**
 * Validacao de CPF/CNPJ com calculo de digitos verificadores.
 * Paridade Laravel `validarCPF`/`validarCNPJ` em DepixService.
 */

export function isValidCpf(cpf: string): boolean {
  const digits = (cpf ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return false;
  // Rejeita sequencias triviais (111111... etc)
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcDv = (slice: string, factor: number): number => {
    let sum = 0;
    for (const c of slice) {
      sum += Number(c) * factor;
      factor--;
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const dv1 = calcDv(digits.slice(0, 9), 10);
  if (dv1 !== Number(digits[9])) return false;
  const dv2 = calcDv(digits.slice(0, 10), 11);
  if (dv2 !== Number(digits[10])) return false;
  return true;
}

export function isValidCnpj(cnpj: string): boolean {
  const digits = (cnpj ?? "").replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const calcDv = (slice: string, weights: number[]): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice[i]) * (weights[i] ?? 0);
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const dv1 = calcDv(digits.slice(0, 12), weights1);
  if (dv1 !== Number(digits[12])) return false;
  const dv2 = calcDv(digits.slice(0, 13), weights2);
  if (dv2 !== Number(digits[13])) return false;
  return true;
}

/**
 * Aceita CPF (11 digitos) OU CNPJ (14 digitos), validando DV.
 */
export function isValidTaxId(taxId: string): boolean {
  const digits = (taxId ?? "").replace(/\D/g, "");
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}
