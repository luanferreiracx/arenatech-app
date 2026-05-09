/**
 * Builds NF-e/NFC-e/NFS-e payload for Nuvem Fiscal API.
 *
 * This is a minimal builder that populates the mandatory fields.
 * Full-featured payloads may require additional configuration per tenant.
 */

interface EmitenteFiscal {
  cnpj: string;
  ie?: string;
  razaoSocial: string;
  nomeFantasia?: string;
  endereco?: {
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
  };
}

interface DestinatarioFiscal {
  nome: string;
  cpfCnpj: string;
  email?: string;
  endereco?: {
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
  };
}

interface ItemFiscal {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  ncm?: string;
  cfop?: string;
}

interface FiscalPayloadInput {
  tipo: "NFE" | "NFCE" | "NFSE";
  ambiente?: "producao" | "homologacao";
  emitente: EmitenteFiscal;
  destinatario: DestinatarioFiscal | null;
  itens: ItemFiscal[];
  valorTotal: number;
}

/**
 * Build the fiscal payload to send to Nuvem Fiscal API.
 */
export function buildFiscalPayload(input: FiscalPayloadInput): Record<string, unknown> {
  const ambiente = input.ambiente ?? (process.env.NUVEM_FISCAL_AMBIENTE as string) ?? "homologacao";

  // NFS-e (servico)
  if (input.tipo === "NFSE") {
    return {
      ambiente,
      rps: {
        numero: Date.now().toString().slice(-8),
        serie: "1",
        tipo: 1, // RPS
      },
      prestador: {
        cpf_cnpj: input.emitente.cnpj.replace(/\D/g, ""),
        razao_social: input.emitente.razaoSocial,
        nome_fantasia: input.emitente.nomeFantasia ?? input.emitente.razaoSocial,
        inscricao_municipal: input.emitente.ie ?? "",
        endereco: buildEndereco(input.emitente.endereco),
      },
      tomador: input.destinatario
        ? {
            cpf_cnpj: input.destinatario.cpfCnpj.replace(/\D/g, ""),
            razao_social: input.destinatario.nome,
            email: input.destinatario.email ?? undefined,
            endereco: buildEndereco(input.destinatario.endereco),
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

  // NF-e / NFC-e
  const modelo = input.tipo === "NFCE" ? "65" : "55";
  return {
    ambiente,
    modelo,
    natureza_operacao: "Venda de mercadoria",
    tipo: 1, // saida
    emitente: {
      cpf_cnpj: input.emitente.cnpj.replace(/\D/g, ""),
      razao_social: input.emitente.razaoSocial,
      nome_fantasia: input.emitente.nomeFantasia ?? input.emitente.razaoSocial,
      inscricao_estadual: input.emitente.ie ?? "",
      endereco: buildEndereco(input.emitente.endereco),
    },
    destinatario: input.destinatario
      ? {
          cpf_cnpj: input.destinatario.cpfCnpj.replace(/\D/g, ""),
          nome: input.destinatario.nome,
          email: input.destinatario.email ?? undefined,
          endereco: buildEndereco(input.destinatario.endereco),
        }
      : undefined,
    itens: input.itens.map((item, idx) => ({
      numero_item: idx + 1,
      produto: {
        codigo: String(idx + 1).padStart(4, "0"),
        descricao: item.descricao,
        ncm: item.ncm ?? "00000000",
        cfop: item.cfop ?? (input.tipo === "NFCE" ? "5102" : "5102"),
        unidade_comercial: "UN",
        quantidade_comercial: item.quantidade,
        valor_unitario_comercial: item.valorUnitario,
        valor_bruto: item.valorTotal,
      },
      imposto: {
        icms: { icms_sn: { csosn: "102", origem: 0 } },
        pis: { pis_nt: { cst: "07" } },
        cofins: { cofins_nt: { cst: "07" } },
      },
    })),
    total: {
      icms_total: {
        valor_produtos: input.valorTotal,
        valor_nf: input.valorTotal,
      },
    },
    pagamento: {
      formas_pagamento: [
        {
          tipo_pagamento: "99", // Outros
          valor: input.valorTotal,
        },
      ],
    },
  };
}

function buildEndereco(addr?: { logradouro?: string; numero?: string; complemento?: string; bairro?: string; municipio?: string; uf?: string; cep?: string }) {
  if (!addr) return undefined;
  return {
    logradouro: addr.logradouro ?? "",
    numero: addr.numero ?? "S/N",
    complemento: addr.complemento ?? undefined,
    bairro: addr.bairro ?? "",
    codigo_municipio: undefined, // Would need IBGE code — filled by Nuvem Fiscal when municipio provided
    nome_municipio: addr.municipio ?? "",
    uf: addr.uf ?? "",
    cep: addr.cep?.replace(/\D/g, "") ?? "",
    codigo_pais: "1058",
    pais: "Brasil",
  };
}
