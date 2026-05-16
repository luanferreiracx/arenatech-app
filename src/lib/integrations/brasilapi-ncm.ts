import { logger } from "@/lib/logger"

export interface NcmSearchResult {
  code: string
  description: string
}

const BRASILAPI_BASE = "https://brasilapi.com.br/api/ncm/v1"
const TIMEOUT_MS = 5000

/**
 * Curated NCM map for common assistência técnica categories.
 * Extracted from legacy ProdutoController@buscarNcm (~45 entries).
 * Searched locally before calling BrasilAPI.
 */
const NCM_CURATED_MAP: Record<string, NcmSearchResult[]> = {
  celular: [{ code: "85171200", description: "Telefones celulares e smartphones" }],
  smartphone: [{ code: "85171200", description: "Telefones celulares e smartphones" }],
  telefone: [{ code: "85171200", description: "Telefones celulares e smartphones" }],
  iphone: [{ code: "85171200", description: "Telefones celulares e smartphones" }],
  tablet: [{ code: "84713019", description: "Tablets e dispositivos portáteis" }],
  ipad: [{ code: "84713019", description: "Tablets e dispositivos portáteis" }],
  notebook: [{ code: "84713012", description: "Notebooks e laptops" }],
  laptop: [{ code: "84713012", description: "Notebooks e laptops" }],
  macbook: [{ code: "84713012", description: "Notebooks e laptops" }],
  computador: [{ code: "84713019", description: "Computadores portáteis" }],
  fone: [{ code: "85183000", description: "Fones de ouvido" }],
  headphone: [{ code: "85183000", description: "Fones de ouvido" }],
  airpods: [{ code: "85183000", description: "Fones de ouvido sem fio" }],
  carregador: [{ code: "85044010", description: "Carregadores para dispositivos eletrônicos" }],
  fonte: [{ code: "85044010", description: "Fontes de alimentação" }],
  cabo: [{ code: "85444200", description: "Cabos e conectores elétricos" }],
  usb: [{ code: "85444200", description: "Cabos USB e conectores" }],
  lightning: [{ code: "85444200", description: "Cabos Lightning" }],
  pelicula: [{ code: "39199090", description: "Películas protetoras autoadesivas" }],
  vidro: [{ code: "39199090", description: "Películas protetoras de vidro" }],
  capa: [{ code: "42029200", description: "Capas e estojos protetores" }],
  case: [{ code: "42029200", description: "Capas e estojos protetores" }],
  bateria: [{ code: "85076000", description: "Baterias de íon-lítio" }],
  tela: [{ code: "90138900", description: "Telas e displays LCD/OLED" }],
  display: [{ code: "90138900", description: "Telas e displays LCD/OLED" }],
  lcd: [{ code: "90138900", description: "Módulos de display LCD" }],
  oled: [{ code: "90138900", description: "Módulos de display OLED" }],
  camera: [{ code: "85258019", description: "Câmeras e módulos fotográficos" }],
  mouse: [{ code: "84716053", description: "Mouse e dispositivos apontadores" }],
  teclado: [{ code: "84716052", description: "Teclados" }],
  impressora: [{ code: "84433219", description: "Impressoras" }],
  roteador: [{ code: "85176294", description: "Roteadores Wi-Fi" }],
  modem: [{ code: "85176255", description: "Modems" }],
  caixa_som: [{ code: "85182200", description: "Caixas de som e alto-falantes" }],
  alto_falante: [{ code: "85182200", description: "Alto-falantes" }],
  smartwatch: [{ code: "91021900", description: "Relógios inteligentes" }],
  relogio: [{ code: "91021900", description: "Relógios inteligentes" }],
  apple_watch: [{ code: "91021900", description: "Relógios inteligentes Apple Watch" }],
  acessorio: [{ code: "85177099", description: "Acessórios para aparelhos eletrônicos" }],
  adaptador: [{ code: "85176299", description: "Adaptadores e conversores" }],
  hub: [{ code: "84716090", description: "Hubs e docking stations" }],
  suporte: [{ code: "83025000", description: "Suportes para dispositivos" }],
  memoria: [{ code: "84717019", description: "Memórias e dispositivos de armazenamento" }],
  pendrive: [{ code: "84717012", description: "Pen drives e flash drives" }],
  ssd: [{ code: "84717019", description: "Unidades de estado sólido (SSD)" }],
  hd: [{ code: "84717012", description: "Discos rígidos" }],
  placa: [{ code: "85340029", description: "Placas de circuito impresso" }],
  conector: [{ code: "85369090", description: "Conectores elétricos" }],
  flex: [{ code: "85369090", description: "Cabos flex internos" }],
  sensor: [{ code: "90318099", description: "Sensores eletrônicos" }],
  microfone: [{ code: "85182100", description: "Microfones" }],
  botao: [{ code: "85365090", description: "Botões e switches" }],
}

/**
 * Search NCM codes: first in curated local map, then BrasilAPI.
 */
export async function searchNcm(term: string): Promise<NcmSearchResult[]> {
  if (term.length < 3) return []

  const normalizedTerm = term.toLowerCase().trim().replace(/\s+/g, "_")

  // 1. Search curated map
  const localResults: NcmSearchResult[] = []
  for (const [key, values] of Object.entries(NCM_CURATED_MAP)) {
    if (key.includes(normalizedTerm) || normalizedTerm.includes(key)) {
      localResults.push(...values)
    }
  }

  // Deduplicate by code
  const seen = new Set(localResults.map((r) => r.code))

  // 2. If local results are few, try BrasilAPI
  if (localResults.length < 5) {
    try {
      const apiResults = await fetchBrasilApiNcm(term)
      for (const r of apiResults) {
        if (!seen.has(r.code)) {
          localResults.push(r)
          seen.add(r.code)
        }
      }
    } catch (error) {
      logger.warn("BrasilAPI NCM search failed, using local results only", { term, error })
    }
  }

  return localResults.slice(0, 20)
}

/**
 * Get NCM details by code.
 */
export async function getNcmByCode(code: string): Promise<NcmSearchResult | null> {
  // Check local map first
  for (const values of Object.values(NCM_CURATED_MAP)) {
    const found = values.find((v) => v.code === code)
    if (found) return found
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const response = await fetch(`${BRASILAPI_BASE}/${code}`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) return null

    const data = (await response.json()) as { codigo: string; descricao: string }
    return { code: data.codigo, description: data.descricao }
  } catch (error) {
    logger.warn("BrasilAPI NCM get by code failed", { code, error })
    return null
  }
}

async function fetchBrasilApiNcm(term: string): Promise<NcmSearchResult[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const response = await fetch(`${BRASILAPI_BASE}?search=${encodeURIComponent(term)}`, {
    signal: controller.signal,
  })
  clearTimeout(timeout)

  if (!response.ok) return []

  const data = (await response.json()) as Array<{ codigo: string; descricao: string }>
  return data.slice(0, 20).map((item) => ({
    code: item.codigo,
    description: item.descricao,
  }))
}
