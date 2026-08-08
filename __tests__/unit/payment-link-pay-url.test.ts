/**
 * URL do link de pagamento e o contrato do valor pré-preenchido.
 *
 * Quem monta a URL (painel) e quem a lê (página pública) precisam concordar no
 * nome do parâmetro e na UNIDADE. É onde divergência passa despercebida: montar
 * centavos e ler reais não gera erro nenhum — gera cobrança 100x errada.
 */
import { describe, it, expect } from "vitest";
import { buildPayUrl, parsePayAmountCents, PAY_AMOUNT_PARAM } from "@/lib/payment-link/pay-url";

const BASE = "https://app.exemplo.com";
const TOKEN = "tok123";

describe("buildPayUrl", () => {
  it("sem valor, devolve o link limpo", () => {
    expect(buildPayUrl(BASE, TOKEN)).toBe(`${BASE}/pay/${TOKEN}`);
  });

  it("com valor, escreve em REAIS — quem lê a URL é uma pessoa", () => {
    expect(buildPayUrl(BASE, TOKEN, 15050)).toBe(`${BASE}/pay/${TOKEN}?${PAY_AMOUNT_PARAM}=150.50`);
  });

  it("valor redondo mantém as duas casas", () => {
    expect(buildPayUrl(BASE, TOKEN, 10000)).toBe(`${BASE}/pay/${TOKEN}?${PAY_AMOUNT_PARAM}=100.00`);
  });

  it("barra sobrando na base não vira barra dupla", () => {
    expect(buildPayUrl(`${BASE}/`, TOKEN)).toBe(`${BASE}/pay/${TOKEN}`);
  });
});

describe("parsePayAmountCents", () => {
  it("ida e volta preserva o valor", () => {
    const url = buildPayUrl(BASE, TOKEN, 15050);
    const raw = new URL(url).searchParams.get(PAY_AMOUNT_PARAM);
    expect(parsePayAmountCents(raw)).toBe(15050);
  });

  it("aceita vírgula — é o que o operador digita ao editar a URL", () => {
    expect(parsePayAmountCents("150,50")).toBe(15050);
  });

  it("aceita inteiro sem centavos", () => {
    expect(parsePayAmountCents("150")).toBe(15000);
  });

  it("ausente ou vazio => null (o cliente preenche)", () => {
    expect(parsePayAmountCents(null)).toBeNull();
    expect(parsePayAmountCents(undefined)).toBeNull();
    expect(parsePayAmountCents("  ")).toBeNull();
  });

  it("lixo é RECUSADO, nunca arredondado para um número plausível", () => {
    // Virar 0 ou NaN silenciosamente cobraria valor errado sem ninguém notar.
    expect(parsePayAmountCents("abc")).toBeNull();
    expect(parsePayAmountCents("150.5.5")).toBeNull();
    expect(parsePayAmountCents("-150")).toBeNull();
    expect(parsePayAmountCents("150.999")).toBeNull();
  });

  it("zero não é cobrança válida", () => {
    expect(parsePayAmountCents("0")).toBeNull();
    expect(parsePayAmountCents("0,00")).toBeNull();
  });
});
