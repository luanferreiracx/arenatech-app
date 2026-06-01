/**
 * Helpers de exibicao/validacao de chave PIX no front (modulo /depix-wallet).
 *
 * Validacao "de verdade" eh feita pelo `formatPixKey` em
 * `src/lib/services/depix-service.ts` no backend (que tambem normaliza o
 * formato pra API PixPay). Aqui sao funcoes PURAS pra UX:
 *
 *   - maskByPixType: formata enquanto o usuario digita (000.000.000-00 etc)
 *   - isPixKeyValid: valida formato basico por tipo (sem rede)
 *   - extractTaxIdFromKey: extrai CPF/CNPJ "limpo" quando a chave eh CPF/CNPJ
 *     (usado pelo auto-fill de "CPF/CNPJ destinatario" no wizard de saque)
 */

import { isValidCpf, isValidCnpj } from "@/lib/utils/tax-id";

export type PixKeyType = "RANDOM" | "CPF" | "CNPJ" | "EMAIL" | "PHONE";

/** Aplica mascara ao valor digitado conforme o tipo selecionado. */
export function maskByPixType(type: PixKeyType, value: string): string {
  const raw = value ?? "";
  switch (type) {
    case "CPF": {
      const d = raw.replace(/\D/g, "").slice(0, 11);
      return d
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1-$2");
    }
    case "CNPJ": {
      const d = raw.replace(/\D/g, "").slice(0, 14);
      return d
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    }
    case "PHONE": {
      // Aceita "+55 11 91234-5678" ou "11912345678".
      const d = raw.replace(/\D/g, "").slice(0, 13); // ate DDI 55 + 11 digitos
      // Se nao tiver DDI, trata como DDD + numero
      if (d.length <= 11) {
        return d
          .replace(/^(\d{2})(\d)/, "($1) $2")
          .replace(/(\d{5})(\d)/, "$1-$2");
      }
      // Com DDI 55 (13 digitos total)
      return d
        .replace(/^(\d{2})(\d{2})(\d)/, "+$1 ($2) $3")
        .replace(/(\d{5})(\d)/, "$1-$2");
    }
    case "EMAIL":
      return raw.trim().toLowerCase();
    case "RANDOM":
      // UUID v4 — mantem o que o usuario digitou (com ou sem hifen).
      return raw.trim().toLowerCase();
  }
}

/** Valida formato basico da chave PIX por tipo. Nao chama rede. */
export function isPixKeyValid(type: PixKeyType, value: string): boolean {
  const raw = value ?? "";
  switch (type) {
    case "CPF":
      return isValidCpf(raw);
    case "CNPJ":
      return isValidCnpj(raw);
    case "EMAIL": {
      const v = raw.trim();
      // RFC 5321 simplificado: tem que ter algo@algo.algo
      return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v);
    }
    case "PHONE": {
      // Aceita +55 11 91234-5678 ou variantes; precisa ter 10 ou 11 digitos
      // (sem contar +55) — celular 11, fixo 10.
      const d = raw.replace(/\D/g, "");
      const trimmed = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
      return trimmed.length === 10 || trimmed.length === 11;
    }
    case "RANDOM": {
      // UUID v4 (com ou sem hifen). 32 hex caracteres.
      const v = raw.replace(/-/g, "").toLowerCase();
      return /^[0-9a-f]{32}$/.test(v);
    }
  }
}

/**
 * Extrai CPF/CNPJ "limpo" (so digitos) da chave PIX quando o tipo for
 * CPF ou CNPJ. Usado pra auto-preencher o campo "CPF/CNPJ destinatario"
 * no wizard de saque — reduz 1 campo a digitar pro usuario.
 *
 * Retorna null se o tipo nao for CPF/CNPJ ou se a chave nao tem digitos
 * validos suficientes ainda.
 */
export function extractTaxIdFromKey(
  type: PixKeyType,
  value: string,
): string | null {
  if (type !== "CPF" && type !== "CNPJ") return null;
  const d = (value ?? "").replace(/\D/g, "");
  if (type === "CPF" && d.length === 11) return d;
  if (type === "CNPJ" && d.length === 14) return d;
  return null;
}

/** Placeholder por tipo (pra mostrar no input). */
export const PIX_KEY_PLACEHOLDER: Record<PixKeyType, string> = {
  CPF: "000.000.000-00",
  CNPJ: "00.000.000/0000-00",
  EMAIL: "voce@dominio.com",
  PHONE: "(11) 91234-5678",
  RANDOM: "00000000-0000-0000-0000-000000000000",
};

/** Maxlength visual por tipo (com mascara aplicada). */
export const PIX_KEY_MAXLEN: Record<PixKeyType, number> = {
  CPF: 14,
  CNPJ: 18,
  EMAIL: 100,
  PHONE: 20,
  RANDOM: 36,
};
