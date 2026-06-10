import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do SDK OpenAI (Groq usa o mesmo SDK). create() é controlado por teste.
const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { isCustomerWaitingReply } from "@/lib/talison/intent";

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
