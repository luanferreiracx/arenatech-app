import { describe, expect, it } from "vitest";
import { buildTalisonBusinessContext, renderTalisonBusinessContext } from "@/lib/talison/business-context";
import { buildSystemPrompt, STORE_INSTRUCTIONS_GUARD, STORE_SCOPE_FALLBACK } from "@/lib/talison/prompt";

describe("Talison prompt", () => {
  it("parametriza a identidade pelo nome do tenant e injeta o contato do banco (multi-tenant)", () => {
    const businessContext = buildTalisonBusinessContext({
      tenantSettings: { tradeName: "Loja do Zé", phone: "(11) 4444-5555", street: "Rua A", city: "SP" },
    });
    const prompt = buildSystemPrompt({ contactName: "Maria", businessContext });

    // Identidade e rótulo do conhecimento usam o nome do tenant, não "Arena Tech".
    expect(prompt).toContain("assistente de atendimento da Loja do Zé");
    expect(prompt).toContain("Nome da loja: Loja do Zé");
    expect(prompt).toContain("CONHECIMENTO DA LOJA");
    expect(prompt).not.toContain("Arena Tech");
    expect(prompt).not.toContain("CONHECIMENTO DA ARENA TECH");
    // Contato derivado do banco do próprio tenant.
    expect(prompt).toContain("(11) 4444-5555");
    // Guardas de comportamento seguem no esqueleto fixo.
    expect(prompt).toContain("não aja como árvore de decisão");
    expect(prompt).toContain("O contato se chama Maria");
  });

  it("multi-tenant: sem dados no banco, NÃO vaza contato/identidade da Arena Tech (nome neutro, sem Instagram/mapa/telefone)", () => {
    const prompt = buildSystemPrompt({ contactName: null, businessContext: buildTalisonBusinessContext() });

    // Nome neutro; nunca o de outra loja.
    expect(prompt).toContain("nossa loja");
    expect(prompt).not.toContain("Arena Tech");
    // Dados de contato hardcoded da Arena Tech não podem vazar.
    expect(prompt).not.toContain("@arenatechpi");
    expect(prompt).not.toContain("maps.app.goo.gl");
    expect(prompt).not.toContain("99564-7443");
    expect(prompt).not.toContain("Riverside Shopping");
    // Horário da Arena Tech também não vaza como default.
    expect(prompt).not.toContain("09h30 às 20h");
  });

  it("NÃO hardcoda mais o conhecimento da loja que passou para as instruções editáveis (ADR 0055)", () => {
    // Sem storeInstructions, o conhecimento específico (identidade rica, escopo por
    // aparelho, limitações, sinônimos, peças premium, iPhones não atendidos) não deve
    // aparecer hardcoded — ele agora vive no campo editável.
    const prompt = buildSystemPrompt({ contactName: null, businessContext: buildTalisonBusinessContext() });

    expect(prompt).not.toContain("foco em Apple");
    expect(prompt).not.toContain("MacBook apenas para troca de bateria");
    expect(prompt).not.toContain("não faz assistência técnica para celulares que não sejam iPhone");
    expect(prompt).not.toContain("PEÇAS são PREMIUM");
    expect(prompt).not.toContain("MODELOS DE iPHONE QUE NÃO ATENDEMOS");
    expect(prompt).not.toContain("Troca de Tampa Traseira");
  });

  it("com instruções da loja: injeta o conhecimento como DADO e reafirma as guardas por último", () => {
    const prompt = buildSystemPrompt({
      contactName: null,
      businessContext: buildTalisonBusinessContext(),
      storeInstructions: "Não atendemos iPhone SE. Usamos peças premium equivalentes à original.",
    });

    expect(prompt).toContain("INSTRUÇÕES DA LOJA");
    expect(prompt).toContain("Não atendemos iPhone SE.");
    // Guarda anti-injeção é a última coisa do prompt.
    expect(prompt.trimEnd().endsWith(STORE_INSTRUCTIONS_GUARD)).toBe(true);
    // Sem instruções, o fallback fail-closed NÃO deve coexistir.
    expect(prompt).not.toContain("ESCOPO NÃO CONFIGURADO");
  });

  it("fail-closed: sem instruções da loja, injeta a guarda de escopo não configurado (deny-path fechado)", () => {
    const prompt = buildSystemPrompt({ contactName: null, businessContext: buildTalisonBusinessContext() });

    expect(prompt).toContain(STORE_SCOPE_FALLBACK);
    expect(prompt).toContain("ESCOPO NÃO CONFIGURADO");
    // A guarda das instruções (que pressupõe texto do admin) não aparece sem texto.
    expect(prompt).not.toContain("<<< INÍCIO DAS INSTRUÇÕES DA LOJA >>>");
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

  it("instrui a traduzir o vocabulário do cliente pro termo canônico antes de buscar", () => {
    const prompt = buildSystemPrompt({ contactName: null, businessContext: buildTalisonBusinessContext() });

    // A REGRA comportamental (traduzir antes de buscar) fica; a LISTA de sinônimos
    // saiu para as instruções da loja (ADR 0055).
    expect(prompt).toContain("VOCABULÁRIO");
    expect(prompt).toContain("traduza o que ele pediu para o termo canônico");
    expect(prompt).toContain("INSTRUÇÕES DA LOJA");
    expect(prompt).not.toContain("Troca de Tampa Traseira");
  });

  it("proíbe inventar links e afirmar disponibilidade sem tool", () => {
    const prompt = buildSystemPrompt({ contactName: null, businessContext: buildTalisonBusinessContext() });

    expect(prompt).toContain("não invente URL");
    expect(prompt).toContain("link_catalogo");
    expect(prompt).toContain("DISPONIBILIDADE DE APARELHO");
    expect(prompt).toContain("buscar_aparelho");
  });

  it("exige coletar dados antes de avaliar troca (não deduzir)", () => {
    const prompt = buildSystemPrompt({ contactName: null, businessContext: buildTalisonBusinessContext() });

    expect(prompt).toContain("AVALIAÇÃO DE TROCA");
    expect(prompt).toContain("iniciar_avaliacao");
    expect(prompt).toContain("calcular_avaliacao");
    expect(prompt).toContain("NUNCA invente nem assuma");
    expect(prompt).toContain("VARIANTE EXATA");
  });

  it("trata story do Instagram: identificar ou perguntar o produto, nunca enrolar", () => {
    const prompt = buildSystemPrompt({ contactName: null, businessContext: buildTalisonBusinessContext() });

    expect(prompt).toContain("STORY/ANÚNCIO DO INSTAGRAM");
    expect(prompt).toContain("qual produto do nosso anúncio");
    expect(prompt).toContain("buscar_aparelho");
  });

  it("é objetivo: não reconfirma dado já informado e manda simulação completa", () => {
    const prompt = buildSystemPrompt({ contactName: null, businessContext: buildTalisonBusinessContext() });

    expect(prompt).toContain("SEJA OBJETIVO");
    expect(prompt).toContain("APROVEITE TUDO que o cliente já disse");
    expect(prompt).toContain("DE UMA VEZ");
    // Parcelamento: tabela completa, sem perguntar "em quantas vezes".
    expect(prompt).toContain("SIMULAÇÃO COMPLETA");
    // Avaliação direta: não reenviar questionário quando o cliente já mandou os dados.
    expect(prompt).toContain("NÃO reenvie o questionário");
  });

  it("não pede bateria de console/MacBook; só usa link da tool; resolve quando cliente não vê o link", () => {
    const prompt = buildSystemPrompt({ contactName: null, businessContext: buildTalisonBusinessContext() });

    // Bug Vitor: bot pediu bateria de PS4 Pro.
    expect(prompt).toContain("NUNCA pergunte saúde da bateria");
    expect(prompt).toContain("CONSOLE ou MacBook");
    // Bug Thaissa: bot inventou uma URL de catálogo. A guarda (não inventar link) fica;
    // o exemplo virou genérico (multi-tenant), não cita mais o domínio da Arena Tech.
    expect(prompt).toContain("não invente URL");
    expect(prompt).toContain("link_catalogo");
    expect(prompt).not.toContain("arenatechpi");
    // Atrito do catálogo: não reenviar link, descrever/transferir.
    expect(prompt).toContain("NÃO CONSEGUE VER O LINK");
  });

  it("aparelho não tem parcela sem juros; reparo não pede armazenamento nem promete peça original", () => {
    const prompt = buildSystemPrompt({ contactName: null, businessContext: buildTalisonBusinessContext() });

    // Bug Renatinha: bot ofereceu 6x sem juros num aparelho.
    expect(prompt).toContain("NENHUM APARELHO");
    expect(prompt).toContain("sem juros");
    // Bug troca de tela pedindo armazenamento (regra de comportamento, permanece).
    expect(prompt).toContain("ARMAZENAMENTO NÃO IMPORTA pra reparo");
    // Bug peça "original Apple": a guarda de NÃO inventar detalhes técnicos fica; o
    // fato "peças premium" agora vem das instruções da loja (ADR 0055).
    expect(prompt).toContain("NUNCA invente detalhes técnicos das peças");
    expect(prompt).not.toContain("PEÇAS são PREMIUM");
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
