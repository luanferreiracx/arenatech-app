/**
 * Builds NF-e/NFC-e/NFS-e payload for Nuvem Fiscal API.
 *
 * This builder constructs the full payload including:
 * - infNFe structure (ide, emit, dest, det, total, transp, pag)
 * - Tax calculations (ICMS Simples Nacional / Lucro Presumido, PIS, COFINS)
 * - Payment method mapping to SEFAZ codes
 * - Proper address formatting with IBGE codes
 *
 * Reference: https://dev.nuvemfiscal.com.br/docs/
 * Based on Laravel NuvemFiscalService.montarPayload()
 */

interface EmitenteFiscal {
  cnpj: string;
  ie?: string;
  razaoSocial: string;
  nomeFantasia?: string;
  regimeTributario?: number; // 1=Simples Nacional, 2=SN Sublimite, 3=Lucro Presumido/Real
  endereco?: EnderecoFiscal;
  telefone?: string;
}

interface EnderecoFiscal {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  codigoMunicipio?: string;
  uf?: string;
  cep?: string;
}

interface DestinatarioFiscal {
  nome: string;
  cpfCnpj: string;
  ie?: string;
  email?: string;
  endereco?: EnderecoFiscal;
}

interface ItemFiscal {
  descricao: string;
  codigo?: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  valorDesconto?: number;
  ncm?: string;
  cfop?: string;
  cest?: string;
  unidade?: string;
  codigoBarras?: string;
}

interface FiscalPayloadInput {
  tipo: "NFE" | "NFCE" | "NFSE";
  ambiente?: "producao" | "homologacao";
  emitente: EmitenteFiscal;
  destinatario: DestinatarioFiscal | null;
  itens: ItemFiscal[];
  valorTotal: number;
  valorDesconto?: number;
  valorFrete?: number;
  valorSeguro?: number;
  valorOutrasDespesas?: number;
  formaPagamento?: string;
  valorPago?: number;
  informacoesComplementares?: string;
}

// ── UF Code mapping ────────────────────────────────────────────────────────

const UF_CODES: Record<string, number> = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17,
  MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29,
  MG: 31, ES: 32, RJ: 33, SP: 35,
  PR: 41, SC: 42, RS: 43,
  MS: 50, MT: 51, GO: 52, DF: 53,
};

function getCodigoUF(uf: string): number {
  return UF_CODES[uf.toUpperCase()] ?? 22; // PI as default
}

// ── Payment method mapping (SEFAZ tPag codes) ─────────────────────────────

function getFormaPagamentoCode(forma: string): string {
  const map: Record<string, string> = {
    dinheiro: "01",
    cheque: "02",
    cartao_credito: "03",
    cartao_debito: "04",
    credito_loja: "05",
    vale_alimentacao: "10",
    vale_refeicao: "11",
    vale_presente: "12",
    vale_combustivel: "13",
    boleto: "15",
    deposito: "16",
    pix: "17",
    transferencia: "18",
    sem_pagamento: "90",
  };
  return map[forma] ?? "99"; // 99 = Outros
}

// ── CFOP helpers ───────────────────────────────────────────────────────────

function getCfopSaida(ufEmitente: string, ufDestino: string | undefined): string {
  if (!ufDestino || ufDestino === ufEmitente) {
    return "5102"; // Venda dentro do estado
  }
  return "6102"; // Venda para outro estado
}

// ── Build functions ────────────────────────────────────────────────────────

function buildEnderecoNFe(addr?: EnderecoFiscal) {
  if (!addr) return undefined;
  return {
    xLgr: addr.logradouro ?? "",
    nro: addr.numero ?? "S/N",
    ...(addr.complemento ? { xCpl: addr.complemento } : {}),
    xBairro: addr.bairro ?? "",
    cMun: addr.codigoMunicipio ? Number(addr.codigoMunicipio) : undefined,
    xMun: addr.municipio ?? "",
    UF: addr.uf ?? "",
    CEP: addr.cep?.replace(/\D/g, "") ?? "",
    cPais: "1058",
    xPais: "Brasil",
    ...(addr.uf ? {} : {}),
  };
}

function buildDestinatario(
  dest: DestinatarioFiscal | null,
  modelo: number,
  ambiente: number,
): Record<string, unknown> | undefined {
  if (!dest) return undefined;

  const cpfCnpj = dest.cpfCnpj.replace(/\D/g, "");

  // NFC-e without recipient is allowed
  if (modelo === 65 && !cpfCnpj) return undefined;
  // NF-e without recipient is invalid (but we allow creating draft)
  if (!cpfCnpj && modelo === 55) return undefined;

  // In homologation, SEFAZ requires specific recipient name
  const nomeDestinatario = ambiente === 2
    ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
    : (dest.nome || "Consumidor Final");

  const result: Record<string, unknown> = {
    xNome: nomeDestinatario,
    indIEDest: 9, // Não contribuinte (default)
  };

  if (cpfCnpj.length === 11) {
    result.CPF = cpfCnpj;
  } else if (cpfCnpj.length === 14) {
    result.CNPJ = cpfCnpj;
    if (dest.ie) {
      result.IE = dest.ie.replace(/\D/g, "");
      result.indIEDest = 1; // Contribuinte
    }
  }

  if (dest.email) {
    result.email = dest.email;
  }

  const enderDest = buildEnderecoNFe(dest.endereco);
  if (enderDest) {
    result.enderDest = enderDest;
  }

  return result;
}

function buildImpostos(
  regimeTributario: number,
  csosn: string = "102",
): Record<string, unknown> {
  // Simples Nacional (CRT 1 or 2) — uses CSOSN instead of CST
  if (regimeTributario === 1 || regimeTributario === 2) {
    return {
      ICMS: {
        [`ICMSSN${csosn}`]: {
          orig: 0,
          CSOSN: csosn,
        },
      },
      PIS: {
        PISOutr: {
          CST: "49", // Outras operações de saída
          vBC: 0,
          pPIS: 0,
          vPIS: 0,
        },
      },
      COFINS: {
        COFINSOutr: {
          CST: "49",
          vBC: 0,
          pCOFINS: 0,
          vCOFINS: 0,
        },
      },
    };
  }

  // Lucro Presumido/Real (CRT 3) — full tax calculation
  // These are default rates; real implementation should use tenant config
  return {
    ICMS: {
      ICMS00: {
        orig: 0,
        CST: "00", // Tributada integralmente
        modBC: 0,
        vBC: 0, // Will be filled per item
        pICMS: 18, // Internal rate — should come from config
        vICMS: 0,
      },
    },
    PIS: {
      PISAliq: {
        CST: "01",
        vBC: 0,
        pPIS: 1.65,
        vPIS: 0,
      },
    },
    COFINS: {
      COFINSAliq: {
        CST: "01",
        vBC: 0,
        pCOFINS: 7.6,
        vCOFINS: 0,
      },
    },
  };
}

function buildItens(
  itens: ItemFiscal[],
  regimeTributario: number,
  ufEmitente: string,
  ufDestino: string | undefined,
): Record<string, unknown>[] {
  return itens.map((item, index) => {
    const cfop = item.cfop ?? getCfopSaida(ufEmitente, ufDestino);
    const imposto = buildImpostos(regimeTributario);

    // For Lucro Presumido/Real, fill in tax bases per item
    if (regimeTributario === 3) {
      const vBC = item.valorTotal;
      const icms = imposto.ICMS as Record<string, Record<string, unknown>>;
      const icms00 = icms.ICMS00;
      if (icms00) {
        icms00.vBC = vBC;
        icms00.vICMS = Math.round(vBC * 0.18 * 100) / 100;
      }
      const pis = (imposto.PIS as Record<string, Record<string, unknown>>).PISAliq;
      if (pis) {
        pis.vBC = vBC;
        pis.vPIS = Math.round(vBC * 0.0165 * 100) / 100;
      }
      const cofins = (imposto.COFINS as Record<string, Record<string, unknown>>).COFINSAliq;
      if (cofins) {
        cofins.vBC = vBC;
        cofins.vCOFINS = Math.round(vBC * 0.076 * 100) / 100;
      }
    }

    const det: Record<string, unknown> = {
      nItem: index + 1,
      prod: {
        cProd: item.codigo ?? String(index + 1).padStart(4, "0"),
        cEAN: item.codigoBarras ?? "SEM GTIN",
        xProd: item.descricao,
        NCM: item.ncm ?? "00000000",
        ...(item.cest ? { CEST: item.cest } : {}),
        CFOP: cfop,
        uCom: item.unidade ?? "UN",
        qCom: item.quantidade,
        vUnCom: item.valorUnitario,
        vProd: item.valorTotal,
        cEANTrib: item.codigoBarras ?? "SEM GTIN",
        uTrib: item.unidade ?? "UN",
        qTrib: item.quantidade,
        vUnTrib: item.valorUnitario,
        indTot: 1,
      },
      imposto,
    };

    if (item.valorDesconto && item.valorDesconto > 0) {
      (det.prod as Record<string, unknown>).vDesc = item.valorDesconto;
    }

    return det;
  });
}

function calcularTotais(
  itens: ItemFiscal[],
  regimeTributario: number,
  valorDesconto?: number,
  valorFrete?: number,
  valorSeguro?: number,
  valorOutrasDespesas?: number,
): Record<string, number> {
  let vProd = 0;
  let vICMS = 0;
  let vPIS = 0;
  let vCOFINS = 0;
  let vDesc = 0;

  for (const item of itens) {
    vProd += item.valorTotal;
    vDesc += item.valorDesconto ?? 0;

    if (regimeTributario === 3) {
      vICMS += Math.round(item.valorTotal * 0.18 * 100) / 100;
      vPIS += Math.round(item.valorTotal * 0.0165 * 100) / 100;
      vCOFINS += Math.round(item.valorTotal * 0.076 * 100) / 100;
    }
  }

  const vDescNfe = valorDesconto ?? 0;
  const vFrete = valorFrete ?? 0;
  const vSeg = valorSeguro ?? 0;
  const vOutro = valorOutrasDespesas ?? 0;

  return {
    vBC: regimeTributario === 3 ? round2(vProd) : 0,
    vICMS: round2(vICMS),
    vICMSDeson: 0,
    vFCP: 0,
    vBCST: 0,
    vST: 0,
    vFCPST: 0,
    vFCPSTRet: 0,
    vProd: round2(vProd),
    vFrete: round2(vFrete),
    vSeg: round2(vSeg),
    vDesc: round2(vDesc + vDescNfe),
    vII: 0,
    vIPI: 0,
    vIPIDevol: 0,
    vPIS: round2(vPIS),
    vCOFINS: round2(vCOFINS),
    vOutro: round2(vOutro),
    vNF: round2(vProd - vDesc - vDescNfe + vFrete + vSeg + vOutro),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function cleanNulls(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      result[key] = cleanNulls(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ── NFS-e builder ──────────────────────────────────────────────────────────

function buildNfsePayload(input: FiscalPayloadInput): Record<string, unknown> {
  const ambiente = input.ambiente ?? (process.env.NUVEM_FISCAL_AMBIENTE as string) ?? "homologacao";

  return {
    ambiente,
    rps: {
      numero: Date.now().toString().slice(-8),
      serie: "1",
      tipo: 1,
    },
    prestador: {
      cpf_cnpj: input.emitente.cnpj.replace(/\D/g, ""),
      razao_social: input.emitente.razaoSocial,
      nome_fantasia: input.emitente.nomeFantasia ?? input.emitente.razaoSocial,
      inscricao_municipal: input.emitente.ie ?? "",
      endereco: buildEnderecoNfse(input.emitente.endereco),
    },
    tomador: input.destinatario
      ? {
          cpf_cnpj: input.destinatario.cpfCnpj.replace(/\D/g, ""),
          razao_social: input.destinatario.nome,
          email: input.destinatario.email ?? undefined,
          endereco: buildEnderecoNfse(input.destinatario.endereco),
        }
      : undefined,
    servico: {
      discriminacao: input.itens.map((i) => `${i.descricao} (${i.quantidade}x)`).join("; "),
      valor_servicos: input.valorTotal,
      iss_retido: false,
      aliquota: 0,
    },
  };
}

function buildEnderecoNfse(addr?: EnderecoFiscal) {
  if (!addr) return undefined;
  return {
    logradouro: addr.logradouro ?? "",
    numero: addr.numero ?? "S/N",
    complemento: addr.complemento ?? undefined,
    bairro: addr.bairro ?? "",
    codigo_municipio: addr.codigoMunicipio ?? undefined,
    nome_municipio: addr.municipio ?? "",
    uf: addr.uf ?? "",
    cep: addr.cep?.replace(/\D/g, "") ?? "",
    codigo_pais: "1058",
    pais: "Brasil",
  };
}

// ── Main builder ───────────────────────────────────────────────────────────

/**
 * Build the fiscal payload to send to Nuvem Fiscal API.
 *
 * For NF-e/NFC-e, builds the full infNFe structure including:
 * - ide (identification)
 * - emit (emitter)
 * - dest (recipient)
 * - det (items with taxes)
 * - total (totals)
 * - transp (transport)
 * - pag (payment)
 * - infAdic (additional info)
 */
export function buildFiscalPayload(input: FiscalPayloadInput): Record<string, unknown> {
  // NFS-e uses a different structure
  if (input.tipo === "NFSE") {
    return buildNfsePayload(input);
  }

  const ambiente = input.ambiente ?? (process.env.NUVEM_FISCAL_AMBIENTE as string) ?? "homologacao";
  const ambienteNum = ambiente === "producao" ? 1 : 2;
  const modelo = input.tipo === "NFCE" ? 65 : 55;
  const ufEmitente = input.emitente.endereco?.uf ?? "PI";
  const ufCodigo = getCodigoUF(ufEmitente);
  const regimeTributario = input.emitente.regimeTributario ?? 1;
  const ufDestino = input.destinatario?.endereco?.uf;
  const codigoMunicipio = input.emitente.endereco?.codigoMunicipio;

  const payload: Record<string, unknown> = {
    ambiente,
    infNFe: {
      versao: "4.00",
      ide: {
        cUF: ufCodigo,
        natOp: "VENDA DE MERCADORIA",
        mod: modelo,
        serie: 1,
        nNF: 0, // Will be set by the caller or auto-generated
        dhEmi: new Date().toISOString(),
        tpNF: 1, // 0=Entrada, 1=Saída
        idDest: (!ufDestino || ufDestino === ufEmitente) ? 1 : 2,
        cMunFG: codigoMunicipio ? Number(codigoMunicipio) : 0,
        tpImp: modelo === 65 ? 4 : 1, // 4=DANFE NFC-e, 1=DANFE Normal
        tpEmis: 1, // Normal
        tpAmb: ambienteNum,
        finNFe: 1, // Normal
        indFinal: modelo === 65 ? 1 : 0,
        indPres: modelo === 65 ? 1 : 0, // Presencial for NFC-e
        procEmi: 0, // Emissão por aplicação do contribuinte
        verProc: "ArenaTech 1.0",
      },
      emit: {
        CNPJ: input.emitente.cnpj.replace(/\D/g, ""),
        xNome: input.emitente.razaoSocial,
        xFant: input.emitente.nomeFantasia ?? input.emitente.razaoSocial,
        IE: input.emitente.ie?.replace(/\D/g, "") ?? "",
        CRT: regimeTributario,
        enderEmit: buildEnderecoNFe(input.emitente.endereco) ?? {
          xLgr: "",
          nro: "S/N",
          xBairro: "",
          cMun: 0,
          xMun: "",
          UF: ufEmitente,
          CEP: "",
        },
      },
      det: buildItens(input.itens, regimeTributario, ufEmitente, ufDestino),
      total: {
        ICMSTot: calcularTotais(
          input.itens,
          regimeTributario,
          input.valorDesconto,
          input.valorFrete,
          input.valorSeguro,
          input.valorOutrasDespesas,
        ),
      },
      transp: {
        modFrete: 9, // Sem frete
      },
      pag: {
        detPag: [
          {
            tPag: getFormaPagamentoCode(input.formaPagamento ?? "dinheiro"),
            vPag: input.valorPago ?? input.valorTotal,
          },
        ],
      },
    },
  };

  // Add emitter phone if available
  if (input.emitente.telefone) {
    const enderEmit = (payload.infNFe as Record<string, unknown>).emit as Record<string, Record<string, unknown> | undefined>;
    if (enderEmit.enderEmit) {
      enderEmit.enderEmit.fone = input.emitente.telefone.replace(/\D/g, "");
    }
  }

  // Add destinatario
  const dest = buildDestinatario(input.destinatario, modelo, ambienteNum);
  if (dest) {
    (payload.infNFe as Record<string, unknown>).dest = dest;
  }

  // Add additional info
  if (input.informacoesComplementares) {
    (payload.infNFe as Record<string, unknown>).infAdic = {
      infCpl: input.informacoesComplementares,
    };
  }

  return cleanNulls(payload);
}
