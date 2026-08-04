/**
 * Contrato público do `config` de integração.
 *
 * `settings.listIntegrations` é `tenantProcedure` — qualquer membro do tenant o
 * chama — e o PDV o consome no diálogo de pagamento. Na prática, TODO operador
 * de caixa recebe essa resposta. Antes deste filtro ele devolvia o `config` cru;
 * enquanto lá só havia `handle` do InfinitePay isso passou despercebido, mas a
 * credencial do WhatsApp Cloud passa a morar no mesmo campo.
 */
import { describe, it, expect } from "vitest";
import { publicIntegrationConfig } from "@/lib/integrations/public-config";

describe("config exposto ao tenant", () => {
  it("o token do WhatsApp NUNCA sai, nem cifrado", () => {
    // Cifrado ele não é legível, mas também não tem motivo nenhum para trafegar
    // até o navegador de um operador de caixa.
    const config = {
      phoneNumberId: "105954558954427",
      tokenSealed: "aXY=:dGFn:ZGFkb3M=",
      wabaId: "123",
    };

    const publico = publicIntegrationConfig(config, "WHATSAPP_CLOUD");

    expect(publico.phoneNumberId).toBe("105954558954427");
    expect(publico.wabaId).toBe("123");
    expect("tokenSealed" in publico).toBe(false);
    expect(JSON.stringify(publico)).not.toContain("dGFn");
  });

  it("preserva o que o PDV precisa do InfinitePay", () => {
    // Regressão: o diálogo de pagamento decide se oferece InfinitePay olhando
    // o `handle`. Filtrar demais quebraria o meio de pagamento.
    const publico = publicIntegrationConfig(
      { handle: "arenatech", defaultEmail: "loja@x.test", apiKey: "segredo" },
      "INFINITEPAY",
    );

    expect(publico.handle).toBe("arenatech");
    expect(publico.defaultEmail).toBe("loja@x.test");
    // `apiKey` não está na allowlist — some por construção.
    expect("apiKey" in publico).toBe(false);
  });

  it("provider desconhecido não devolve nada", () => {
    // O padrão seguro: allowlist ausente = `{}`, nunca "devolve tudo". É o que
    // faz um provider NOVO nascer sem vazar até alguém decidir o que é público.
    const publico = publicIntegrationConfig({ segredo: "x", token: "y" }, "PROVIDER_NOVO");
    expect(publico).toEqual({});
  });

  it("aguenta config nulo ou malformado", () => {
    expect(publicIntegrationConfig(null, "WHATSAPP_CLOUD")).toEqual({});
    expect(publicIntegrationConfig("texto", "WHATSAPP_CLOUD")).toEqual({});
    expect(publicIntegrationConfig(42, "INFINITEPAY")).toEqual({});
  });
});
