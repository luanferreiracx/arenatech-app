/**
 * Rascunho de formulário longo (auditoria de frontend 2026-08-04).
 *
 * O wizard de OS guarda os 5 passos num `useState` só: fechar a aba no passo 4
 * perdia cliente, aparelho, checklist e itens. Estes testes fixam o contrato do
 * armazenamento — sobrevive ao reload, expira, e não derruba a tela quando o
 * `sessionStorage` não coopera.
 *
 * Testam as funções puras de leitura/escrita através do módulo; o hook em si é
 * casca fina de React em volta delas.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** sessionStorage em memória — o ambiente de teste não tem o do browser. */
function installMemoryStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

const KEY = "draft:teste";

describe("rascunho de formulário", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installMemoryStorage();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("o que foi gravado volta na leitura", async () => {
    const { __test } = await import("@/hooks/use-form-draft");
    __test.write(KEY, { nome: "Ana", passo: 4 });
    expect(__test.read(KEY, 60_000)).toEqual({ nome: "Ana", passo: 4 });
  });

  it("rascunho velho é descartado (não reabre trabalho de ontem)", async () => {
    const { __test } = await import("@/hooks/use-form-draft");
    // Grava com carimbo de 13h atrás; o teto padrão é 12h (um turno).
    store.set(KEY, JSON.stringify({ at: Date.now() - 13 * 60 * 60 * 1000, value: { x: 1 } }));
    expect(__test.read(KEY, 12 * 60 * 60 * 1000)).toBeNull();
    // E some do storage, para não ficar ocupando espaço nem reaparecer.
    expect(store.has(KEY)).toBe(false);
  });

  it("sem nada gravado, devolve null", async () => {
    const { __test } = await import("@/hooks/use-form-draft");
    expect(__test.read(KEY, 60_000)).toBeNull();
  });

  it("JSON corrompido não derruba a tela — devolve null", async () => {
    const { __test } = await import("@/hooks/use-form-draft");
    store.set(KEY, "{lixo");
    expect(__test.read(KEY, 60_000)).toBeNull();
  });

  it("storage indisponível (modo privado) não lança", async () => {
    const { __test } = await import("@/hooks/use-form-draft");
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    });
    // Perder a rede de segurança é ruim; derrubar o formulário em uso é pior.
    expect(() => __test.write(KEY, { x: 1 })).not.toThrow();
    expect(__test.read(KEY, 60_000)).toBeNull();
  });
});
