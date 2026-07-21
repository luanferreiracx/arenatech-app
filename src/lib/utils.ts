import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Aplica mascara `00.000.000/0000-00` ao CNPJ. Se invalido (!= 14 digitos), retorna como esta. */
export function formatCnpj(value: string | null | undefined): string {
  if (!value) return "";
  const d = value.replace(/\D/g, "");
  if (d.length !== 14) return value;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Aplica mascara `000.000.000-00` ao CPF. Se invalido (!= 11 digitos), retorna como esta. */
export function formatCpf(value: string | null | undefined): string {
  if (!value) return "";
  const d = value.replace(/\D/g, "");
  if (d.length !== 11) return value;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Resolve o documento fiscal do cliente ja mascarado: CPF para PF, CNPJ para PJ.
 * O modelo Customer (ADR 0005, PF+PJ unificado) guarda CPF e CNPJ em campos
 * separados — sem isto o recibo de um cliente PJ nao mostrava documento algum.
 * Robusto a dados legados: prefere o campo coerente com `type`, com fallback
 * pro que estiver preenchido.
 */
export function formatCustomerDocument(customer: {
  type?: "PF" | "PJ" | null;
  cpf?: string | null;
  cnpj?: string | null;
}): { label: "CPF" | "CNPJ"; value: string } | null {
  const cpf = customer.cpf?.replace(/\D/g, "") ?? "";
  const cnpj = customer.cnpj?.replace(/\D/g, "") ?? "";
  const preferCnpj = customer.type === "PJ" || (!cpf && !!cnpj);
  if (preferCnpj && cnpj) return { label: "CNPJ", value: formatCnpj(cnpj) };
  if (cpf) return { label: "CPF", value: formatCpf(cpf) };
  if (cnpj) return { label: "CNPJ", value: formatCnpj(cnpj) };
  return null;
}
