import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do SDK OpenAI (Groq usa o mesmo SDK). create() é controlado por teste.
const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { isCustomerWaitingReply, looksLikeWaitingNudge, isObviousCloser } from "@/lib/talison/intent";

describe("isObviousCloser", () => {
  it("reconhece encerramentos/adiamentos óbvios", () => {
    for (const t of ["ok", "obrigado", "obrigada!", "valeu", "vlw", "tchau", "até mais", "vou pensar", "vou ver", "tô a caminho", "vou na loja", "👍", "🙏"]) {
      expect(isObviousCloser(t)).toBe(true);
    }
  });
  it("NÃO marca 'sim'/'certo'/perguntas como encerramento", () => {
    for (const t of ["sim", "certo", "tem retorno?", "ola?", "quero o 16 pro", "qual o valor"]) {
      expect(isObviousCloser(t)).toBe(false);
    }
  });
});

describe("looksLikeWaitingNudge", () => {
  it("detecta cutucadas/perguntas como aguardando", () => {
    for (const t of ["ola?", "Olá?", "oi", "tem retorno?", "alguém aí?", "cadê?", "ainda não veio", "tem previsão?", "?"]) {
      expect(looksLikeWaitingNudge(t)).toBe(true);
    }
  });
  it("não marca encerramentos como aguardando", () => {
    for (const t of ["ok", "obrigado", "valeu", "tô a caminho", "até mais", "👍", ""]) {
      expect(looksLikeWaitingNudge(t)).toBe(false);
    }
  });
});

describe("isCustomerWaitingReply", () => {
  beforeEach(() => {
    create.mockReset();
    process.env.GROQ_API_KEY = "test-key";
  });

  it("retorna true quando o modelo diz AGUARDANDO", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: "AGUARDANDO" } }] });
    expect(await isCustomerWaitingReply("Cliente: cadê meu orçamento?")).toBe(true);
  });

  it("retorna false quando o modelo diz ENCERROU (ex.: 'ok')", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: "ENCERROU" } }] });
    expect(await isCustomerWaitingReply("Loja: vamos prosseguir\nCliente: ok")).toBe(false);
  });

  it("é conservador (false) sem GROQ_API_KEY", async () => {
    delete process.env.GROQ_API_KEY;
    expect(await isCustomerWaitingReply("Cliente: oi")).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("é conservador (false) em erro da API", async () => {
    create.mockRejectedValue(new Error("boom"));
    expect(await isCustomerWaitingReply("Cliente: oi")).toBe(false);
  });
});
