/**
 * SQ-2 — classificar a falha de um saque: "a Eulen recusou" vs "não sei".
 *
 * `status = FAILED` no nosso banco nunca provou que o dinheiro não saiu. Em
 * 2026-07-27 um saque foi transmitido de verdade e gravado como FAILED (o
 * timeout comeu a resposta); o operador confiou no registro e pagou duas vezes.
 *
 * Esta é a decisão que separa os dois casos. Errar para "incerto" custa um
 * bloqueio de 10 minutos; errar para "recusado" custa um pagamento em dobro —
 * então o default é sempre o incerto.
 */
import { describe, it, expect } from "vitest";
import { classificarFalhaHttp } from "@/lib/services/depix-service";

describe("classificação da falha de saque pelo status HTTP", () => {
  it("4xx é recusa definitiva: a Eulen entendeu e disse não", () => {
    // Limite diário, chave inválida, compliance — o saque não existe do lado
    // dela, e prender o operador aqui seria só atrapalhar.
    expect(classificarFalhaHttp(400)).toBe("rejected");
    expect(classificarFalhaHttp(401)).toBe("rejected");
    expect(classificarFalhaHttp(403)).toBe("rejected");
    expect(classificarFalhaHttp(422)).toBe("rejected");
  });

  it("5xx é incerto: ela pode ter processado antes de falhar em responder", () => {
    // O `HTTP 520` de 2026-06-23 em produção é exatamente este caso.
    expect(classificarFalhaHttp(500)).toBe("unknown");
    expect(classificarFalhaHttp(502)).toBe("unknown");
    expect(classificarFalhaHttp(503)).toBe("unknown");
    expect(classificarFalhaHttp(520)).toBe("unknown");
  });

  it("408 e 429 são 4xx de nome, mas não recusam nada", () => {
    // Timeout e "pergunte de novo mais tarde" não afirmam que o pedido deixou
    // de ser processado. Classificá-los como recusa reabriria o buraco.
    expect(classificarFalhaHttp(408)).toBe("unknown");
    expect(classificarFalhaHttp(429)).toBe("unknown");
  });

  it("qualquer coisa fora do esperado conta como incerto", () => {
    expect(classificarFalhaHttp(0)).toBe("unknown");
    expect(classificarFalhaHttp(302)).toBe("unknown");
    expect(classificarFalhaHttp(999)).toBe("unknown");
  });
});
