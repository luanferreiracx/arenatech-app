import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchAddressByCep, isViaCEPError } from "./viacep";

describe("fetchAddressByCep", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns address for valid CEP", async () => {
    const mockResponse = {
      cep: "64000-010",
      logradouro: "Rua Álvaro Mendes",
      complemento: "",
      bairro: "Centro",
      localidade: "Teresina",
      uf: "PI",
    };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await fetchAddressByCep("64000010");

    expect(isViaCEPError(result)).toBe(false);
    if (!isViaCEPError(result)) {
      expect(result.logradouro).toBe("Rua Álvaro Mendes");
      expect(result.bairro).toBe("Centro");
      expect(result.cidade).toBe("Teresina");
      expect(result.estado).toBe("PI");
    }
  });

  it("returns error when ViaCEP responds with {erro: true}", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ erro: true }), { status: 200 }),
    );

    const result = await fetchAddressByCep("00000000");

    expect(isViaCEPError(result)).toBe(true);
    if (isViaCEPError(result)) {
      expect(result.error).toBe("CEP não encontrado, preencha manualmente");
    }
  });

  it("returns error on timeout/network failure", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("AbortError"));

    const result = await fetchAddressByCep("64000010");

    expect(isViaCEPError(result)).toBe(true);
    if (isViaCEPError(result)) {
      expect(result.error).toBe("CEP não encontrado, preencha manualmente");
    }
  });

  it("returns error for malformed CEP (not 8 digits) without calling fetch", async () => {
    const result = await fetchAddressByCep("1234");

    expect(isViaCEPError(result)).toBe(true);
    if (isViaCEPError(result)) {
      expect(result.error).toBe("CEP deve ter 8 dígitos");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns error for non-ok HTTP response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("", { status: 500 }),
    );

    const result = await fetchAddressByCep("64000010");

    expect(isViaCEPError(result)).toBe(true);
    if (isViaCEPError(result)) {
      expect(result.error).toBe("CEP não encontrado, preencha manualmente");
    }
  });

  it("strips non-digit chars from input before fetching", async () => {
    const mockResponse = {
      logradouro: "Rua X",
      bairro: "Centro",
      localidade: "Cidade",
      uf: "SP",
    };

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await fetchAddressByCep("64.000-010");

    expect(isViaCEPError(result)).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      "https://viacep.com.br/ws/64000010/json/",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
