import { logger } from "@/lib/logger";

export interface ImeiResult {
  imei: string;
  valid: boolean;
  brand: string;
  model: string;
  blacklisted: boolean;
  warranty: { status: string; expiry: string | null };
  carrier: string;
  icloudLock?: string;
  simLock?: boolean;
  error?: string;
}

/**
 * Query IMEI information from external API.
 *
 * When IMEI_API_URL and IMEI_API_KEY env vars are configured, makes a real
 * API request. Otherwise returns mock data for development.
 */
export async function queryImei(imei: string): Promise<ImeiResult> {
  const apiUrl = process.env.IMEI_API_URL;
  const apiKey = process.env.IMEI_API_KEY;

  if (!apiUrl || !apiKey) {
    logger.info("IMEI: mock mode (no credentials)", { imei });
    return getMockResult(imei);
  }

  logger.info("IMEI: querying", { imei });

  try {
    const response = await fetch(`${apiUrl}/check`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imei }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      logger.error("IMEI: API error", { imei, status: response.status });
      throw new Error(`IMEI API returned HTTP ${response.status}`);
    }

    const data: unknown = await response.json();

    return parseApiResponse(data, imei);
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Timeout ao consultar API de IMEI");
    }
    throw error;
  }
}

function parseApiResponse(data: unknown, imei: string): ImeiResult {
  if (!data || typeof data !== "object") {
    throw new Error("Resposta inválida da API de IMEI");
  }

  const obj = data as Record<string, unknown>;

  // Adapt to imeicheck.com response format
  const result = (obj["object"] ?? obj) as Record<string, unknown>;

  return {
    imei,
    valid: true,
    brand: String(result["brand"] ?? result["manufacturer"] ?? "Unknown"),
    model: String(result["model"] ?? result["Model"] ?? "Unknown"),
    blacklisted: Boolean(
      result["blacklisted"] ??
        (typeof result["blacklistStatus"] === "string" &&
          /blacklist|blocked|stolen|lost/i.test(result["blacklistStatus"])),
    ),
    warranty: {
      status: String(result["warrantyStatus"] ?? result["WarrantyStatus"] ?? "unknown"),
      expiry: result["coverageEndDate"] ? String(result["coverageEndDate"]) : null,
    },
    carrier: String(result["carrier"] ?? "Unknown"),
    icloudLock: result["fmiOn"] != null ? (Boolean(result["fmiOn"]) ? "ON" : "OFF") : undefined,
  };
}

function getMockResult(imei: string): ImeiResult {
  // Use last digit to vary mock data
  const lastDigit = parseInt(imei[imei.length - 1]!, 10);
  const isBlacklisted = lastDigit === 9;

  const models = [
    { brand: "Apple", model: "iPhone 15 Pro" },
    { brand: "Apple", model: "iPhone 14" },
    { brand: "Samsung", model: "Galaxy S24 Ultra" },
    { brand: "Samsung", model: "Galaxy A54" },
    { brand: "Motorola", model: "Edge 40 Pro" },
  ];

  const selected = models[lastDigit % models.length]!;

  return {
    imei,
    valid: true,
    brand: selected.brand,
    model: selected.model,
    blacklisted: isBlacklisted,
    warranty: {
      status: lastDigit > 5 ? "active" : "expired",
      expiry: lastDigit > 5 ? "2027-06-01" : "2025-01-01",
    },
    carrier: lastDigit % 2 === 0 ? "Unlocked" : "Vivo",
    icloudLock: selected.brand === "Apple" ? (lastDigit === 8 ? "ON" : "OFF") : undefined,
  };
}
