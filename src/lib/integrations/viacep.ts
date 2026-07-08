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

const LOOKUP_TIMEOUT_MS = 5000;

type ViaCepData = {
  erro?: boolean;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

type BrasilApiCepData = {
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

/**
 * Busca genérica em um provedor de CEP. Retorna o endereço, ou `null` em
 * QUALQUER falha (rede/timeout/HTTP) ou "não encontrado" — para o chamador tentar
 * o próximo provedor. Timeout de 5s por tentativa. Roda no browser (CORS OK em
 * ViaCEP e BrasilAPI).
 */
async function tryProvider<T>(
  url: string,
  map: (data: T) => AddressResult | null,
): Promise<AddressResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null; // inclui 404 (não encontrado) do BrasilAPI
    return map((await res.json()) as T);
  } catch {
    return null;
  }
}

/**
 * Consulta endereço por CEP, com FALLBACK: ViaCEP (primário) → BrasilAPI.
 *
 * Antes usava só o ViaCEP e qualquer falha (CEP fora da base do ViaCEP, timeout,
 * blip de rede) virava "CEP não encontrado". O BrasilAPI (já usado no app p/
 * CNPJ/NCM) cobre CEPs que o ViaCEP não tem e dá resiliência a falha transitória.
 * Só retorna erro se AMBOS falharem/não acharem. Degradação graciosa.
 */
export async function fetchAddressByCep(cep: string): Promise<ViaCEPResult> {
  const digits = cep.replace(/\D/g, "");

  if (digits.length !== 8) {
    return { error: "CEP deve ter 8 dígitos" };
  }

  // 1) ViaCEP (primário) — 200 com `erro:true` = não encontrado.
  const viacep = await tryProvider<ViaCepData>(
    `https://viacep.com.br/ws/${digits}/json/`,
    (d) =>
      d?.erro
        ? null
        : {
            logradouro: d.logradouro ?? "",
            bairro: d.bairro ?? "",
            cidade: d.localidade ?? "",
            estado: d.uf ?? "",
          },
  );
  if (viacep) return viacep;

  // 2) BrasilAPI (fallback) — 404 = não encontrado (tryProvider já trata !res.ok).
  const brasilapi = await tryProvider<BrasilApiCepData>(
    `https://brasilapi.com.br/api/cep/v1/${digits}`,
    (d) =>
      d?.city
        ? {
            logradouro: d.street ?? "",
            bairro: d.neighborhood ?? "",
            cidade: d.city ?? "",
            estado: d.state ?? "",
          }
        : null,
  );
  if (brasilapi) return brasilapi;

  return { error: "CEP não encontrado, preencha manualmente" };
}
