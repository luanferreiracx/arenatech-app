import { logger } from "@/lib/logger";
import { isValidLuhn } from "@/lib/validators/imei";

/**
 * Resultado de consulta de dispositivo Apple via CheckIMEI.com.
 * Paridade Laravel IMEICheckService::processarResposta — estrutura rica.
 */
export interface DeviceCheckResult {
  success: boolean;
  source: string;
  queriedAt: string;
  tipoConsulta: "IMEI" | "Serial";
  identificador: string;
  /** mensagem de erro/falha amigavel (quando success=false) */
  error?: string;
  message?: string;

  infoBasica?: {
    modelo: string | null;
    modeloCodigo: string | null;
    imei: string | null;
    imei2: string | null;
    meid: string | null;
    serial: string | null;
    fabricante: string;
  };
  garantia?: {
    status: string | null;
    ativa: boolean;
    dataExpiracao: string | null;
    dataCompra: string | null;
    dataCompraValidada: boolean;
    paisCompra: string | null;
  };
  seguranca?: {
    icloudLock: string;
    bloqueioOperadora: string | null;
    bloqueioSim: string | null;
    blacklist: string;
    blacklistBloqueado: boolean;
  };
  status?: {
    ativado: string | null;
    registrado: string | null;
    demo: string | null;
    substituido: string | null;
    recondicionado: string | null;
    reparoAtivo: string | null;
    appleCareElegivel: string | null;
  };
  validacoes?: Record<string, string | boolean>;
}

const CHECKIMEI_BASE = "https://alpha.imeicheck.com/api/php-api";

/**
 * Consulta um dispositivo Apple por IMEI (15 digitos) ou Serial (8-17 alfanum).
 *
 * Em producao usa a API real CheckIMEI.com (IMEI_API_KEY + IMEI_SERVICE_ID).
 * Sem credenciais, retorna mock para desenvolvimento.
 *
 * Paridade Laravel IMEICheckService::consultarDispositivo.
 */
export async function queryDevice(identificador: string): Promise<DeviceCheckResult> {
  const id = identificador.trim().toUpperCase();
  const apiKey = process.env.IMEI_CHECK_API_KEY;
  const serviceId = process.env.IMEI_CHECK_SERVICE_ID ?? "39";

  if (!apiKey) {
    logger.info("IMEI: mock mode (no credentials)", { identificador: id });
    return getMockResult(id);
  }

  logger.info("IMEI: querying CheckIMEI", { identificador: id });

  const url = new URL(`${CHECKIMEI_BASE}/create`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("service", serviceId);
  url.searchParams.set("imei", id);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Timeout ao consultar API de IMEI");
    }
    throw error;
  }

  if (!response.ok) {
    logger.error("IMEI: API error", { identificador: id, status: response.status });
    throw new Error(`Erro HTTP ao consultar API (${response.status})`);
  }

  const data = (await response.json()) as Record<string, unknown> | null;
  if (!data) {
    throw new Error("Resposta invalida da API de IMEI");
  }

  const apiStatus = data["status"];
  if (apiStatus !== "success") {
    return {
      success: false,
      source: "CheckIMEI.com",
      queriedAt: nowBr(),
      tipoConsulta: isImei(id) ? "IMEI" : "Serial",
      identificador: id,
      error: "Consulta falhou",
      message:
        typeof data["response"] === "string"
          ? data["response"]
          : typeof data["result"] === "string"
            ? data["result"]
            : "Erro desconhecido",
    };
  }

  return processResponse(data, id);
}

function processResponse(data: Record<string, unknown>, id: string): DeviceCheckResult {
  const result: DeviceCheckResult = {
    success: true,
    source: "CheckIMEI.com",
    queriedAt: nowBr(),
    tipoConsulta: isImei(id) ? "IMEI" : "Serial",
    identificador: id,
  };

  const obj = data["object"];
  if (obj && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    const pick = (a: string, b: string): string | null => {
      const v = o[a] ?? o[b];
      return v == null ? null : String(v);
    };

    const warrantyStatus = pick("WarrantyStatus", "warrantyStatus");
    const blacklistStatus = pick("BlacklistStatus", "blacklistStatus");

    result.infoBasica = {
      modelo: pick("Model", "model"),
      modeloCodigo: pick("ModelCode", "modelCode"),
      imei: pick("IMEI", "imei") ?? id,
      imei2: pick("IMEI2", "imei2"),
      meid: pick("MEID", "meid"),
      serial: pick("Serial", "serial"),
      fabricante: "Apple",
    };
    result.garantia = {
      status: warrantyStatus,
      ativa: warrantyStatus ? !/expired/i.test(warrantyStatus) : false,
      dataExpiracao: pick("coverageEndDate", "CoverageEndDate"),
      dataCompra: pick("estPurchaseDate", "EstPurchaseDate"),
      dataCompraValidada: (pick("PurchaseDateValidated", "purchaseDateValidated") ?? "No") === "Yes",
      paisCompra: pick("purchaseCountry", "PurchaseCountry"),
    };
    result.seguranca = {
      icloudLock: o["fmiOn"] ? "Ligado" : "Desligado",
      bloqueioOperadora: pick("carrier", "Carrier"),
      bloqueioSim: pick("simLock", "SimLock"),
      blacklist: blacklistStatus && blacklistStatus.length > 0 ? blacklistStatus : "Sem restricoes",
      blacklistBloqueado: interpretarBlacklist(blacklistStatus ?? ""),
    };
    result.status = {
      ativado: pick("ActivationStatus", "activationStatus"),
      registrado: pick("Registered", "registered"),
      demo: pick("DemoUnit", "demoUnit"),
      substituido: pick("Replaced", "replaced"),
      recondicionado: pick("Refurbished", "refurbished"),
      reparoAtivo: pick("ActiveRepair", "activeRepair"),
      appleCareElegivel: pick("AppleCareEligible", "appleCareEligible"),
    };
  } else {
    result.infoBasica = {
      modelo: typeof data["result"] === "string" ? data["result"] : null,
      modeloCodigo: null,
      imei: id,
      imei2: null,
      meid: null,
      serial: null,
      fabricante: "Apple",
    };
  }

  // Validacoes locais (paridade enriquecerDados)
  if (isImei(id)) {
    result.validacoes = {
      imeiValidoLuhn: isValidLuhn(id),
      tac: id.slice(0, 8),
    };
    if (result.infoBasica && !result.infoBasica.meid) {
      result.infoBasica.meid = id.slice(0, 14);
    }
  } else {
    result.validacoes = {
      serialFormato: id.length === 12 ? "Novo (12 chars)" : "Antigo (11 chars)",
      fabrica: id.slice(0, 3),
      anoSemana: id.slice(3, 5),
    };
  }

  return result;
}

function isImei(id: string): boolean {
  return id.length === 15 && /^\d{15}$/.test(id);
}

function interpretarBlacklist(status: string): boolean {
  if (!status) return false;
  return /blacklist|blocked|stolen|lost/i.test(status);
}

function nowBr(): string {
  // Formato dd/mm/yyyy HH:MM:SS em America/Sao_Paulo
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

function getMockResult(id: string): DeviceCheckResult {
  const imei = isImei(id);
  const variant = ((id[id.length - 1] ?? "0").charCodeAt(0) % 5);
  // Modelo deixa EXPLICITO que e mock — nunca confundir com resultado real.
  const selected = { model: "[DADO FICTICIO — API nao configurada]", code: "MOCK" };
  const blacklisted = variant === 4;
  const warrantyActive = variant > 1;

  const result: DeviceCheckResult = {
    success: true,
    source: "Mock (dev — sem credenciais)",
    queriedAt: nowBr(),
    tipoConsulta: imei ? "IMEI" : "Serial",
    identificador: id,
    infoBasica: {
      modelo: selected.model,
      modeloCodigo: selected.code,
      imei: imei ? id : null,
      imei2: null,
      meid: imei ? id.slice(0, 14) : null,
      serial: imei ? null : id,
      fabricante: "Apple",
    },
    garantia: {
      status: warrantyActive ? "Apple Limited Warranty" : "Out of Warranty (Expired)",
      ativa: warrantyActive,
      dataExpiracao: warrantyActive ? "2027-06-01" : "2025-01-01",
      dataCompra: "2024-06-01",
      dataCompraValidada: true,
      paisCompra: "Brazil",
    },
    seguranca: {
      icloudLock: variant === 3 ? "Ligado" : "Desligado",
      bloqueioOperadora: variant % 2 === 0 ? "Unlocked" : "Vivo",
      bloqueioSim: "Unlocked",
      blacklist: blacklisted ? "Blacklisted (Lost)" : "Sem restricoes",
      blacklistBloqueado: blacklisted,
    },
    status: {
      ativado: "Activated",
      registrado: "Yes",
      demo: "No",
      substituido: "No",
      recondicionado: variant === 1 ? "Yes" : "No",
      reparoAtivo: "No",
      appleCareElegivel: warrantyActive ? "Yes" : "No",
    },
  };

  if (imei) {
    result.validacoes = { imeiValidoLuhn: isValidLuhn(id), tac: id.slice(0, 8) };
  } else {
    result.validacoes = {
      serialFormato: id.length === 12 ? "Novo (12 chars)" : "Antigo (11 chars)",
      fabrica: id.slice(0, 3),
      anoSemana: id.slice(3, 5),
    };
  }

  return result;
}
