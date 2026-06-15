import { describe, expect, it } from "vitest";
import { buildTalisonBusinessContext, renderTalisonBusinessContext } from "@/lib/talison/business-context";
import { buildSystemPrompt } from "@/lib/talison/prompt";

describe("Talison prompt", () => {
  it("inclui conhecimento real da Arena Tech sem virar roteiro rígido", () => {
    const businessContext = buildTalisonBusinessContext();
    const prompt = buildSystemPrompt({ contactName: "Maria", businessContext });

    expect(prompt).toContain("assistência técnica e loja");
    expect(prompt).toContain("iPhone, iPad, MacBook, AirPods");
    expect(prompt).toContain("notebooks/PCs, consoles, periféricos");
    expect(prompt).toContain("Riverside Shopping");
    expect(prompt).toContain("Entrega/retirada");
    expect(prompt).toContain("não faz assistência técnica para celulares que não sejam iPhone");
    expect(prompt).toContain("não vende celulares que não sejam iPhone nem tablets que não sejam iPad");
    expect(prompt).toContain("não aja como árvore de decisão");
    expect(prompt).toContain("O contato se chama Maria");
  });

  it("usa configuração do tenant antes dos defaults do Laravel", () => {
    const businessContext = buildTalisonBusinessContext({
      chatbotConfig: { businessHoursStart: "10:00", businessHoursEnd: "18:00" },
      tenantSettings: {
        tradeName: "Arena Tech Matriz",
        phone: "(86) 1111-2222",
        street: "Av. Teste",
        streetNumber: "123",
        city: "Teresina",
        state: "PI",
        businessHours: "Seg-Sex 10h-18h",
      },
      tenantAssistanceSettings: {
        pixDiscount: { toString: () => "7.50" },
        installmentsNoInterest: 10,
      },
    });
    const rendered = renderTalisonBusinessContext(businessContext);

    expect(businessContext.storeName).toBe("Arena Tech Matriz");
    expect(rendered).toContain("(86) 1111-2222");
    expect(rendered).toContain("Seg-Sex 10h-18h");
    expect(rendered).toContain("7,50% de desconto");
    expect(rendered).toContain("até 10x sem juros");
    expect(rendered).not.toContain("09h30 às 20h");
  });

  it("mantém dados variáveis como obrigatoriamente dependentes de tool", () => {
    const prompt = buildSystemPrompt({
      contactName: null,
      businessContext: buildTalisonBusinessContext(),
    });

    expect(prompt).toContain("NUNCA inventa números");
    expect(prompt).toContain("preço, valor de troca, status, prazo específico");
    expect(prompt).toContain("quanto custa o X?\", use a tool certa");
    expect(prompt).toContain("SEMPRE chame simular_parcelamento");
    expect(prompt).toContain("JÁ É o valor FINAL no cartão");
  });

  it("instrui a traduzir o vocabulário do cliente pro termo canônico do catálogo", () => {
    const prompt = buildSystemPrompt({ contactName: null, businessContext: buildTalisonBusinessContext() });

    expect(prompt).toContain("VOCABULÁRIO");
    expect(prompt).toContain("Troca de Tampa Traseira");
    expect(prompt).toContain("vidro traseiro");
    expect(prompt).toContain("power banks");
  });

  it("proíbe inventar links e afirmar disponibilidade sem tool", () => {
    const prompt = buildSystemPrompt({ contactName: null, businessContext: buildTalisonBusinessContext() });

    expect(prompt).toContain("não invente URL");
    expect(prompt).toContain("link_catalogo");
    expect(prompt).toContain("DISPONIBILIDADE DE APARELHO");
    expect(prompt).toContain("buscar_aparelho");
  });

  it("inclui aviso dinâmico de fora de horário quando configurado", () => {
    const prompt = buildSystemPrompt({
      contactName: null,
      businessContext: buildTalisonBusinessContext(),
      businessHoursNote: "Estamos fora do horário agora; responda e avise que o time retorna no próximo período.",
    });

    expect(prompt).toContain("Estamos fora do horário agora");
  });
});
