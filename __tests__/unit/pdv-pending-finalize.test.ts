/**
 * Pendência de finalização do PDV (auditoria de frontend 2026-08-04, P0-1).
 *
 * O estado "cliente JÁ pagou e a venda não foi registrada" vivia só em
 * `useState`: um F5 ou o desmonte do dialog apagava a única prova de que o
 * dinheiro entrou, e o operador refazia a cobrança.
 *
 * Estes testes fixam o contrato da persistência: sobrevive ao reload, é
 * escopada à venda certa e não explode quando o `sessionStorage` não existe.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  persistPendingFinalize,
  readPendingFinalize,
  type PendingFinalize,
} from "@/lib/pdv/pending-finalize";

const SALE = "11111111-1111-1111-1111-111111111111";
const OUTRA_VENDA = "22222222-2222-2222-2222-222222222222";

const pendencia: PendingFinalize = {
  saleId: SALE,
  amountCents: 250000,
  label: "DePix",
  message: "Network request failed",
};

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

describe("pendência de finalização do PDV", () => {
  beforeEach(() => installMemoryStorage());
  afterEach(() => vi.unstubAllGlobals());

  it("sobrevive ao reload: o que foi gravado volta na leitura", () => {
    persistPendingFinalize(pendencia);
    expect(readPendingFinalize(SALE)).toEqual(pendencia);
  });

  it("é escopada à venda: não vaza a pendência para outra venda", () => {
    // Sem isto, o operador abriria uma venda NOVA e veria o aviso de dinheiro
    // recebido da anterior — pior que não avisar, porque destrói a confiança.
    persistPendingFinalize(pendencia);
    expect(readPendingFinalize(OUTRA_VENDA)).toBeNull();
  });

  it("limpar remove de verdade (venda registrada deixa de pendurar aviso)", () => {
    persistPendingFinalize(pendencia);
    persistPendingFinalize(null);
    expect(readPendingFinalize(SALE)).toBeNull();
  });

  it("sem nada gravado, devolve null", () => {
    expect(readPendingFinalize(SALE)).toBeNull();
  });

  it("JSON corrompido não derruba a tela — devolve null", () => {
    sessionStorage.setItem("pdv:pending-finalize", "{lixo");
    expect(readPendingFinalize(SALE)).toBeNull();
  });

  it("sessionStorage indisponível (modo privado) não quebra o fluxo", () => {
    // Gravar não pode lançar: perder a persistência é ruim, derrubar a venda
    // em curso é pior.
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
    expect(() => persistPendingFinalize(pendencia)).not.toThrow();
    expect(readPendingFinalize(SALE)).toBeNull();
  });
});
