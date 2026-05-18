/**
 * NF-e Import Service — Parse XML, extract data, allocate costs.
 * Faithful to Laravel NfeImportService.php.
 */

import { logger } from "@/lib/logger"

interface NfeXmlData {
  accessKey: string
  nfNumber: string
  series: string
  issueDate: string
  issuerCnpj: string
  issuerName: string
  issuerTradeName: string
  issuerIe: string
  recipientCnpj: string
  recipientName: string
  totalProductsValue: number
  freightValue: number
  insuranceValue: number
  discountValue: number
  otherExpensesValue: number
  icmsValue: number
  ipiValue: number
  pisValue: number
  cofinsValue: number
  items: NfeXmlItem[]
}

interface NfeXmlItem {
  itemNumber: number
  productCode: string
  barcode: string
  description: string
  ncm: string
  cest: string
  cfop: string
  unit: string
  quantity: number
  unitPrice: number
  totalValue: number
  discountValue: number
  icmsValue: number
  ipiValue: number
}

/**
 * Validate NF-e access key format (44 digits, valid structure).
 * Faithful to Laravel validarChaveAcesso().
 */
export function validateAccessKey(key: string): boolean {
  const digits = key.replace(/\D/g, "")
  if (digits.length !== 44) return false

  // Valid state codes (UFs)
  const validUFs = [
    "11", "12", "13", "14", "15", "16", "17",
    "21", "22", "23", "24", "25", "26", "27", "28", "29",
    "31", "32", "33", "35",
    "41", "42", "43",
    "50", "51", "52", "53",
  ]
  const uf = digits.substring(0, 2)
  if (!validUFs.includes(uf)) return false

  // Model must be 55 (NF-e) or 65 (NFC-e)
  const model = digits.substring(20, 22)
  if (model !== "55" && model !== "65") return false

  return true
}

/**
 * Parse NF-e XML string into structured data.
 * Extracts: emitter, recipient, values, items.
 */
export function parseNfeXml(xmlContent: string): NfeXmlData {
  // Simple XML parser using regex (production would use xml2js or fast-xml-parser)
  const getTag = (xml: string, tag: string): string => {
    const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i")
    const m = xml.match(re)
    return m?.[1]?.trim() ?? ""
  }

  const getSection = (xml: string, tag: string): string => {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i")
    const m = xml.match(re)
    return m?.[1] ?? ""
  }

  const toNum = (s: string): number => {
    const n = parseFloat(s)
    return isNaN(n) ? 0 : n
  }

  // Extract access key from protNFe or infNFe
  let accessKey = ""
  const chNFeMatch = xmlContent.match(/<chNFe>(\d{44})<\/chNFe>/)
  if (chNFeMatch) accessKey = chNFeMatch[1]!
  if (!accessKey) {
    const idMatch = xmlContent.match(/Id="NFe(\d{44})"/)
    if (idMatch) accessKey = idMatch[1]!
  }

  // Emitter (emit)
  const emit = getSection(xmlContent, "emit")
  const issuerCnpj = getTag(emit, "CNPJ")
  const issuerName = getTag(emit, "xNome")
  const issuerTradeName = getTag(emit, "xFant")
  const issuerIe = getTag(emit, "IE")

  // Recipient (dest)
  const dest = getSection(xmlContent, "dest")
  const recipientCnpj = getTag(dest, "CNPJ") || getTag(dest, "CPF")
  const recipientName = getTag(dest, "xNome")

  // Identification (ide)
  const ide = getSection(xmlContent, "ide")
  const nfNumber = getTag(ide, "nNF")
  const series = getTag(ide, "serie")
  const issueDate = getTag(ide, "dhEmi").substring(0, 10) // YYYY-MM-DD

  // Totals (ICMSTot)
  const tot = getSection(xmlContent, "ICMSTot")
  const totalProductsValue = toNum(getTag(tot, "vProd"))
  const freightValue = toNum(getTag(tot, "vFrete"))
  const insuranceValue = toNum(getTag(tot, "vSeg"))
  const discountValue = toNum(getTag(tot, "vDesc"))
  const otherExpensesValue = toNum(getTag(tot, "vOutro"))
  const icmsValue = toNum(getTag(tot, "vICMS"))
  const ipiValue = toNum(getTag(tot, "vIPI"))
  const pisValue = toNum(getTag(tot, "vPIS"))
  const cofinsValue = toNum(getTag(tot, "vCOFINS"))

  // Items (det)
  const items: NfeXmlItem[] = []
  const detRegex = /<det[^>]*nItem="?(\d+)"?[^>]*>([\s\S]*?)<\/det>/gi
  let detMatch: RegExpExecArray | null
  while ((detMatch = detRegex.exec(xmlContent)) !== null) {
    const itemNum = parseInt(detMatch[1]!, 10)
    const detContent = detMatch[2]!
    const prod = getSection(detContent, "prod")
    const imposto = getSection(detContent, "imposto")

    items.push({
      itemNumber: itemNum,
      productCode: getTag(prod, "cProd"),
      barcode: getTag(prod, "cEAN"),
      description: getTag(prod, "xProd"),
      ncm: getTag(prod, "NCM"),
      cest: getTag(prod, "CEST"),
      cfop: getTag(prod, "CFOP"),
      unit: getTag(prod, "uCom"),
      quantity: toNum(getTag(prod, "qCom")),
      unitPrice: toNum(getTag(prod, "vUnCom")),
      totalValue: toNum(getTag(prod, "vProd")),
      discountValue: toNum(getTag(prod, "vDesc")),
      icmsValue: toNum(getTag(getSection(imposto, "ICMS"), "vICMS")),
      ipiValue: toNum(getTag(getSection(imposto, "IPI"), "vIPI")),
    })
  }

  logger.info("NF-e XML parsed", {
    accessKey,
    nfNumber,
    issuerCnpj,
    itemCount: items.length,
  })

  return {
    accessKey,
    nfNumber,
    series,
    issueDate,
    issuerCnpj,
    issuerName,
    issuerTradeName,
    issuerIe,
    recipientCnpj,
    recipientName,
    totalProductsValue,
    freightValue,
    insuranceValue,
    discountValue,
    otherExpensesValue,
    icmsValue,
    ipiValue,
    pisValue,
    cofinsValue,
    items,
  }
}

/**
 * Allocate additional costs (freight, insurance, other) proportionally across items.
 * Faithful to Laravel salvarCustos() allocation logic.
 */
export function allocateCosts(
  items: Array<{ totalValue: number; quantity: number }>,
  freight: number,
  insurance: number,
  otherExpenses: number
): Array<{ allocatedFreight: number; allocatedInsurance: number; allocatedOtherExpenses: number; totalUnitCost: number }> {
  const grandTotal = items.reduce((sum, i) => sum + i.totalValue, 0)
  if (grandTotal === 0) {
    return items.map(() => ({
      allocatedFreight: 0,
      allocatedInsurance: 0,
      allocatedOtherExpenses: 0,
      totalUnitCost: 0,
    }))
  }

  return items.map((item) => {
    const proportion = item.totalValue / grandTotal
    const allocFreight = freight * proportion
    const allocInsurance = insurance * proportion
    const allocOther = otherExpenses * proportion
    const totalCostItem = item.totalValue + allocFreight + allocInsurance + allocOther
    const unitCost = item.quantity > 0 ? totalCostItem / item.quantity : 0

    return {
      allocatedFreight: Math.round(allocFreight * 10000) / 10000,
      allocatedInsurance: Math.round(allocInsurance * 10000) / 10000,
      allocatedOtherExpenses: Math.round(allocOther * 10000) / 10000,
      totalUnitCost: Math.round(unitCost * 10000) / 10000,
    }
  })
}
