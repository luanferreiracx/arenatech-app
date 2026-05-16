export interface AddressResult {
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export interface ViaCEPError {
  error: string;
}

export type ViaCEPResult = AddressResult | ViaCEPError;

function isError(result: ViaCEPResult): result is ViaCEPError {
  return "error" in result;
}

export { isError as isViaCEPError };

/**
 * Consulta endereço por CEP via API ViaCEP.
 * Timeout: 5 segundos. Sem retry.
 * Degradação graciosa: retorna error em qualquer falha.
 */
export async function fetchAddressByCep(cep: string): Promise<ViaCEPResult> {
  const digits = cep.replace(/\D/g, "");

  if (digits.length !== 8) {
    return { error: "CEP deve ter 8 dígitos" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return { error: "CEP não encontrado, preencha manualmente" };
    }

    const data = (await res.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };

    if (data.erro) {
      return { error: "CEP não encontrado, preencha manualmente" };
    }

    return {
      logradouro: data.logradouro ?? "",
      bairro: data.bairro ?? "",
      cidade: data.localidade ?? "",
      estado: data.uf ?? "",
    };
  } catch {
    return { error: "CEP não encontrado, preencha manualmente" };
  }
}
