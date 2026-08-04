/**
 * Verificação de credenciais da WhatsApp Cloud API contra a Graph API da Meta.
 *
 * Por que isto existe: sem uma checagem real, o lojista cola um token errado na
 * tela, vê "salvo com sucesso" e descobre dias depois — quando um cliente
 * reclama — que nenhuma mensagem saiu. O envio pela Meta falha de várias formas
 * que não aparecem sozinhas (token expirado, número não registrado, permissão
 * faltando), e o sistema hoje só descobre isso na hora de enviar, tarde demais.
 *
 * O que se verifica é COMPORTAMENTO na fronteira: dado o que a Graph API
 * responde, qual diagnóstico o sistema produz. O `fetch` é trocado porque a
 * alternativa seria bater na Meta de verdade em cada `pnpm test` — mas o
 * contrato testado é o da resposta HTTP real, com os payloads que a
 * documentação descreve.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { checkCloudCredentials } from "@/lib/services/whatsapp-credential-check";

/** Resposta real do `GET /{phone-number-id}` (docs da Meta, v22+). */
const NUMERO_OK = {
  id: "105954558954427",
  display_phone_number: "5586999998888",
  verified_name: "Arena Tech",
  code_verification_status: "VERIFIED",
  quality_rating: "GREEN",
};

function respostaFake(status: number, corpo: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("credencial válida", () => {
  it("confirma e devolve o número conectado", async () => {
    vi.stubGlobal("fetch", respostaFake(200, NUMERO_OK));

    const r = await checkCloudCredentials({ token: "EAAG...", phoneNumberId: "105954558954427" });

    expect(r.ok).toBe(true);
    // Devolver o nome e o número é o ponto: "conectado" sozinho não diz ao
    // lojista SE ele conectou o número certo — e conectar o número errado é o
    // erro mais provável de quem administra mais de uma conta.
    if (r.ok) {
      expect(r.displayPhoneNumber).toBe("5586999998888");
      expect(r.verifiedName).toBe("Arena Tech");
      expect(r.qualityRating).toBe("GREEN");
    }
  });
});

describe("credencial inválida", () => {
  it("token expirado vira um motivo que o lojista entende", async () => {
    // Payload real da Meta para token vencido (OAuthException, code 190).
    vi.stubGlobal(
      "fetch",
      respostaFake(401, {
        error: {
          message: "Error validating access token: Session has expired",
          type: "OAuthException",
          code: 190,
        },
      }),
    );

    const r = await checkCloudCredentials({ token: "expirado", phoneNumberId: "105954558954427" });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      // `reason` é para a máquina decidir (ex.: pedir novo token); `message` é
      // para a pessoa ler. Devolver só o texto cru da Meta em inglês seria jogar
      // o problema no colo de quem não pode resolvê-lo.
      expect(r.reason).toBe("invalid_token");
      expect(r.message).toMatch(/token/i);
      expect(r.message).not.toContain("OAuthException");
    }
  });

  it("ID de número inexistente aponta para o CAMPO errado", async () => {
    // Code 100 = objeto não encontrado. Aqui o token pode estar perfeito — quem
    // está errado é o ID. Dizer "token inválido" mandaria a pessoa gerar um
    // token novo, que não resolveria nada, e ela tentaria de novo em círculo.
    vi.stubGlobal(
      "fetch",
      respostaFake(400, {
        error: {
          message: "Unsupported get request. Object with ID '999' does not exist",
          type: "GraphMethodException",
          code: 100,
        },
      }),
    );

    const r = await checkCloudCredentials({ token: "EAAG...", phoneNumberId: "999" });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("phone_number_not_found");
      expect(r.message).toMatch(/ID do número|número/i);
    }
  });

  it("número ainda não verificado na Meta é recusado, mesmo com HTTP 200", async () => {
    // O caso traiçoeiro: a Meta responde 200 e o número existe, mas ele não
    // completou a verificação — enviar por ele falharia. Aceitar aqui salvaria
    // uma configuração que não entrega mensagem, que é justamente o que este
    // módulo existe para impedir.
    vi.stubGlobal(
      "fetch",
      respostaFake(200, { ...NUMERO_OK, code_verification_status: "NOT_VERIFIED" }),
    );

    const r = await checkCloudCredentials({ token: "EAAG...", phoneNumberId: "105954558954427" });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("phone_not_verified");
      expect(r.message).toMatch(/verifica/i);
    }
  });
});

describe("falhas de rede", () => {
  it("Meta fora do ar NÃO vira 'credencial inválida'", async () => {
    // A distinção importa: culpar a credencial de um problema de rede faria a
    // pessoa trocar um token que estava certo — e o `fetch` cru lançaria a
    // exceção pra cima, virando erro 500 numa tela de configuração.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));

    const r = await checkCloudCredentials({ token: "EAAG...", phoneNumberId: "105954558954427" });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("network_error");
      expect(r.message).not.toMatch(/inv\u00e1lid/i);
    }
  });
});

describe("o token nunca vaza", () => {
  it("não aparece em nenhuma mensagem devolvida ao cliente", async () => {
    // Guarda contra o refactor bem-intencionado que resolve um bug incluindo
    // "o valor recebido" na mensagem de erro. A mensagem vai para a tela e para
    // o log; o token é credencial de envio da loja inteira.
    const SEGREDO = "EAAG-token-secreto-nao-vazar";
    const cenarios = [
      respostaFake(401, { error: { code: 190, message: "expired" } }),
      respostaFake(400, { error: { code: 100, message: "not found" } }),
      respostaFake(500, { error: { code: 1, message: "internal" } }),
      respostaFake(200, { ...NUMERO_OK, code_verification_status: "NOT_VERIFIED" }),
    ];

    for (const cenario of cenarios) {
      vi.stubGlobal("fetch", cenario);
      const r = await checkCloudCredentials({ token: SEGREDO, phoneNumberId: "105954558954427" });
      expect(JSON.stringify(r)).not.toContain(SEGREDO);
    }
  });
});
