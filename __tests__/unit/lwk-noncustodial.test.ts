/**
 * lwk-service non-custodial (ADR 0051 Etapa 3): garante que o cliente TS
 * monta o body certo p/ o LWK assinar com passphrase, e traduz os erros
 * (invalid_passphrase -> PT-BR). fetch e mockado — nao toca o servico real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function mockFetchOnce(status: number, body: Record<string, unknown>) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function importService() {
  // Reimporta o modulo apos setar env (getConfig le process.env).
  vi.resetModules();
  return import("@/lib/services/lwk-service");
}

beforeEach(() => {
  process.env.LWK_API_URL = "http://lwk.test";
  process.env.LWK_API_KEY = "k";
  delete process.env.LWK_MOCK;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("lwk-service.transfer — non-custodial", () => {
  it("inclui encrypted_seed + passphrase no body quando fornecidos", async () => {
    const fetchMock = mockFetchOnce(200, { txid: "abc", accepted: true });
    const { transfer } = await importService();

    await transfer("11111111-1111-1111-1111-111111111111", [{ to: "lq1x", amountBrl: 10 }], {
      encryptedSeed: { v: 1, ciphertext: "..." },
      passphrase: "minha-senha",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sentBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(sentBody.encrypted_seed).toEqual({ v: 1, ciphertext: "..." });
    expect(sentBody.passphrase).toBe("minha-senha");
  });

  it("NAO inclui passphrase no body quando custodial (sem encryptedSeed)", async () => {
    const fetchMock = mockFetchOnce(200, { txid: "abc" });
    const { transfer } = await importService();

    await transfer("11111111-1111-1111-1111-111111111111", [{ to: "lq1x", amountBrl: 10 }], {
      idempotencyKey: "k1",
    });

    const sentBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(sentBody).not.toHaveProperty("encrypted_seed");
    expect(sentBody).not.toHaveProperty("passphrase");
  });

  it("traduz invalid_passphrase para PT-BR", async () => {
    mockFetchOnce(400, { error: "invalid_passphrase" });
    const { transfer } = await importService();

    const res = await transfer("11111111-1111-1111-1111-111111111111", [{ to: "lq1x", amountBrl: 10 }], {
      encryptedSeed: { v: 1 },
      passphrase: "errada",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("Senha da carteira incorreta.");
  });
});

describe("lwk-service helpers non-custodial", () => {
  it("encryptSeed envia passphrase e retorna o blob", async () => {
    const fetchMock = mockFetchOnce(200, {
      encrypted_seed: { v: 1, ciphertext: "x" },
      descriptor: "ct(d)",
    });
    const { encryptSeed } = await importService();

    const res = await encryptSeed("11111111-1111-1111-1111-111111111111", "senha");
    expect(res.success).toBe(true);
    expect(res.encryptedSeed).toEqual({ v: 1, ciphertext: "x" });
    const sentBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(sentBody.passphrase).toBe("senha");
  });

  it("rewrapSeed traduz invalid_passphrase", async () => {
    mockFetchOnce(400, { error: "invalid_passphrase" });
    const { rewrapSeed } = await importService();
    const res = await rewrapSeed("11111111-1111-1111-1111-111111111111", { v: 1 }, "velha", "nova");
    expect(res.success).toBe(false);
    expect(res.error).toBe("Senha da carteira incorreta.");
  });

  it("recoverWallet traduz mnemonic invalido e descriptor que nao corresponde", async () => {
    mockFetchOnce(400, { error: "mnemonic invalido" });
    let svc = await importService();
    let res = await svc.recoverWallet("11111111-1111-1111-1111-111111111111", "x", "nova");
    expect(res.error).toBe("Frase de recuperacao invalida.");

    mockFetchOnce(400, { error: "mnemonic nao corresponde a esta carteira" });
    svc = await importService();
    res = await svc.recoverWallet("11111111-1111-1111-1111-111111111111", "x", "nova");
    expect(res.error).toBe("Esta frase nao corresponde a carteira deste tenant.");
  });
});
