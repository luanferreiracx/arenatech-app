/**
 * Consulta CPF na API DirectD (Receita Federal — dados basicos).
 * Paridade Laravel CpfLookupService.
 *
 * Configuracao: env DIRECTD_TOKEN. Sem token, retorna null (modo dev).
 */

import { logger } from "@/lib/logger";

const API_URL = "https://apiv3.directd.com.br/api/ReceitaFederalPessoaFisica";

export interface CpfLookupResult {
  found: boolean;
  name: string | null;
  cpf: string | null;
  birthDate: string | null; // dd/mm/yyyy
  status: string | null; // situacao cadastral
  registeredAt: string | null; // dataInscricao
  hasDeath: boolean;
  source: "directd" | "mock";
}

export async function lookupCpfDirectD(
  cpf: string,
  birthDate?: string,
): Promise<CpfLookupResult | null> {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return null;

  const token = process.env.DIRECTD_TOKEN;
  if (!token) {
    logger.warn("DirectD: token nao configurado");
    return null;
  }

  const params = new URLSearchParams({ Cpf: clean, Token: token });
  if (birthDate) params.set("DataNascimento", birthDate);

  try {
    const res = await fetch(`${API_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.warn("DirectD CPF HTTP error", { status: res.status, cpf: clean });
      return null;
    }
    const data = (await res.json()) as {
      metaDados?: { resultado?: string; mensagem?: string };
      retorno?: {
        nome?: string;
        cpf?: string;
        dataNascimento?: string;
        situacaoCadastral?: string;
        dataInscricao?: string;
        possuiObito?: boolean;
      };
    };
    if (data.metaDados?.resultado !== "Sucesso") {
      logger.info("DirectD CPF nao encontrado", { cpf: clean, msg: data.metaDados?.mensagem });
      return null;
    }
    const r = data.retorno ?? {};
    const birth = r.dataNascimento?.includes(" ")
      ? r.dataNascimento.split(" ")[0]
      : r.dataNascimento;
    return {
      found: true,
      name: r.nome ?? null,
      cpf: r.cpf ?? null,
      birthDate: birth ?? null,
      status: r.situacaoCadastral ?? null,
      registeredAt: r.dataInscricao ?? null,
      hasDeath: !!r.possuiObito,
      source: "directd",
    };
  } catch (err) {
    logger.error("DirectD CPF exception", {
      cpf: clean,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
