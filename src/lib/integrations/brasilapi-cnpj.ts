import { logger } from "@/lib/logger"

export interface CnpjResult {
  razaoSocial: string
  nomeFantasia: string | null
  telefone: string | null
  email: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  municipio: string | null
  uf: string | null
}

const BRASILAPI_BASE = "https://brasilapi.com.br/api/cnpj/v1"
const TIMEOUT_MS = 5000

/**
 * Fetch company data from BrasilAPI by CNPJ.
 * Graceful degradation: returns null if API is unavailable.
 */
export async function lookupCnpj(cnpj: string): Promise<CnpjResult | null> {
  const digits = cnpj.replace(/\D/g, "")
  if (digits.length !== 14) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const response = await fetch(`${BRASILAPI_BASE}/${digits}`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) return null

    const data = (await response.json()) as Record<string, unknown>

    return {
      razaoSocial: (data.razao_social as string) || "",
      nomeFantasia: (data.nome_fantasia as string) || null,
      telefone: (data.ddd_telefone_1 as string) || null,
      email: (data.email as string) || null,
      cep: (data.cep as string) || null,
      logradouro: (data.logradouro as string) || null,
      numero: (data.numero as string) || null,
      complemento: (data.complemento as string) || null,
      bairro: (data.bairro as string) || null,
      municipio: (data.municipio as string) || null,
      uf: (data.uf as string) || null,
    }
  } catch (error) {
    logger.warn("BrasilAPI CNPJ lookup failed", { cnpj: digits.slice(0, 6) + "...", error })
    return null
  }
}
