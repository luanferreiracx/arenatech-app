/**
 * Tools do Talison — testes de comportamento.
 *
 * O Prisma é mockado com um `tx` falso por teste (só os métodos que cada
 * tool usa). O foco é o contrato que protege contra alucinação:
 *  - dado de negócio sempre formatado e copiável;
 *  - caminho ok:false quando não há dado (modelo deve transferir, não inventar);
 *  - cálculos (garantia) feitos pela tool, não pelo modelo;
 *  - escrita idempotente (lead não duplica).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TalisonToolContext, TalisonTx } from "@/lib/talison/tools/contract";
import { consultarStatusOs, verificarGarantia } from "@/lib/talison/tools/service-order";
import { estimarOrcamento } from "@/lib/talison/tools/catalog";
import { iniciarAvaliacao, calcularAvaliacao } from "@/lib/talison/tools/valuation";
import { buscarAparelho, buscarAcessorio } from "@/lib/talison/tools/stock";
import { simularParcelamento } from "@/lib/talison/tools/installment";
import { qualificarLead, sinalizarLeadQuente, transferirParaHumano } from "@/lib/talison/tools/handoff";
import { toggleStatus } from "@/lib/talison/chatwoot-client";
import { sendGroupMessage } from "@/lib/services/whatsapp-service";

vi.mock("@/lib/talison/chatwoot-client", () => ({
  sendBotMessage: vi.fn().mockResolvedValue(true),
  toggleStatus: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/services/whatsapp-service", () => ({
  sendGroupMessage: vi.fn().mockResolvedValue({ success: true, messageId: "m1" }),
}));

beforeEach(() => {
  vi.mocked(toggleStatus).mockClear();
  vi.mocked(sendGroupMessage).mockClear();
});

const baseConversation = {
  id: "conv-1",
  contactPhone: "5586999998888",
  contactName: "João",
  customerId: "cust-1",
  externalId: "42",
};

/** Monta um ctx cujo withTenant executa o callback com o `tx` falso dado. */
function makeCtx(tx: Partial<TalisonTx>): TalisonToolContext {
  return {
    tenantId: "tenant-1",
    conversation: baseConversation,
    withTenant: (fn) => fn(tx as TalisonTx),
  };
}

describe("consultar_status_os", () => {
  it("traduz o status do enum pra linguagem de cliente", async () => {
    const tx = {
      serviceOrder: {
        findFirst: vi.fn().mockResolvedValue({
          number: "OS-100",
          status: "READY_FOR_PICKUP",
          deviceModel: "iPhone 13",
          estimatedDate: null,
          totalAmount: { toString: () => "350.00" },
          deliveredDate: null,
        }),
      },
    } as unknown as Partial<TalisonTx>;

    const result = await consultarStatusOs.execute({ numero_os: "OS-100" }, makeCtx(tx));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.display).toContain("pronto para retirada");
      expect(result.display).toContain("OS-100");
      expect(result.data.valor_total).toBe("R$ 350,00");
    }
  });

  it("retorna ok:false quando não acha a OS (modelo deve transferir, não inventar)", async () => {
    const tx = {
      serviceOrder: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as Partial<TalisonTx>;

    const result = await consultarStatusOs.execute({ numero_os: "OS-999" }, makeCtx(tx));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("OS-999");
  });
});

describe("verificar_garantia", () => {
  it("considera em garantia quando entregue há menos meses que o prazo", async () => {
    const deliveredDate = new Date();
    deliveredDate.setMonth(deliveredDate.getMonth() - 1); // entregue há 1 mês
    const tx = {
      serviceOrder: {
        findFirst: vi.fn().mockResolvedValue({
          number: "OS-200",
          status: "DELIVERED",
          warrantyMonths: 3,
          deliveredDate,
          deviceModel: "iPhone 12",
        }),
      },
    } as unknown as Partial<TalisonTx>;

    const result = await verificarGarantia.execute({}, makeCtx(tx));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.em_garantia).toBe(true);
  });

  it("considera fora de garantia quando o prazo já passou", async () => {
    const deliveredDate = new Date();
    deliveredDate.setMonth(deliveredDate.getMonth() - 6); // entregue há 6 meses
    const tx = {
      serviceOrder: {
        findFirst: vi.fn().mockResolvedValue({
          number: "OS-201",
          status: "DELIVERED",
          warrantyMonths: 3,
          deliveredDate,
          deviceModel: "iPhone 12",
        }),
      },
    } as unknown as Partial<TalisonTx>;

    const result = await verificarGarantia.execute({}, makeCtx(tx));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.em_garantia).toBe(false);
  });
});

describe("estimar_orcamento", () => {
  it("devolve preço do banco formatado em BRL", async () => {
    const tx = {
      service: {
        findMany: vi.fn().mockResolvedValue([
          { name: "Troca de tela", basePrice: { toString: () => "499.90" }, deviceModel: "iPhone 13", estimatedTime: "2h" },
        ]),
      },
    } as unknown as Partial<TalisonTx>;

    const result = await estimarOrcamento.execute({ servico: "tela", modelo: "iPhone 13" }, makeCtx(tx));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.display).toContain("R$ 499,90");
  });

  it("retorna ok:false quando não há preço cadastrado", async () => {
    const tx = {
      service: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as Partial<TalisonTx>;

    const result = await estimarOrcamento.execute({ servico: "xpto" }, makeCtx(tx));
    expect(result.ok).toBe(false);
  });

  it("tokeniza o termo canônico exigindo cada palavra no nome ('tampa traseira')", async () => {
    // O modelo traduz o pedido do cliente pro termo canônico (via prompt) e
    // chama a tool com "tampa traseira". O filtro exige tampa E traseira no nome,
    // casando "Troca de Tampa Traseira" sem casar "Troca de Vidro" frontal.
    const findMany = vi.fn().mockResolvedValue([
      { name: "Troca de Tampa Traseira iPhone 13", basePrice: { toString: () => "350.00" }, deviceModel: "iPhone 13", estimatedTime: "1h" },
    ]);
    const tx = { service: { findMany } } as unknown as Partial<TalisonTx>;

    const result = await estimarOrcamento.execute({ servico: "tampa traseira", modelo: "iPhone 13" }, makeCtx(tx));

    expect(result.ok).toBe(true);
    const where = findMany.mock.calls[0]?.[0]?.where as { AND: Array<{ name: { contains: string } }> };
    expect(where.AND.map((c) => c.name.contains)).toEqual(["tampa", "traseira"]);
  });

  it("ignora acento e stopwords no termo ('troca de câmera')", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { name: "Troca de Câmera iPhone 12", basePrice: { toString: () => "200.00" }, deviceModel: "iPhone 12", estimatedTime: "40min" },
    ]);
    const tx = { service: { findMany } } as unknown as Partial<TalisonTx>;

    const result = await estimarOrcamento.execute({ servico: "troca de câmera" }, makeCtx(tx));

    expect(result.ok).toBe(true);
    const where = findMany.mock.calls[0]?.[0]?.where as { AND: Array<{ name: { contains: string } }> };
    // só "camera" sobra (troca/de são stopwords); acento removido
    expect(where.AND.map((c) => c.name.contains)).toEqual(["camera"]);
  });
});

describe("iniciar_avaliacao", () => {
  it("envia o questionário da categoria com todos os campos e o disclaimer", async () => {
    const result = await iniciarAvaliacao.execute({ categoria: "iphone" }, makeCtx({}));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.display).toContain("Saúde da bateria");
      expect(result.display).toContain("Tem caixa");
      expect(result.display).toContain("marcas de uso");
      expect(result.display).toContain("iCloud");
      expect(result.display).toContain("validade de APENAS 1 DIA");
    }
  });
});

describe("calcular_avaliacao", () => {
  // valuation que casa iPhone 13 Pro Max 128GB > 90% = 2600 (valores reais da tabela).
  function valuationTx(row: Record<string, unknown> | null) {
    const findFirst = vi.fn().mockResolvedValue(row);
    return { tx: { deviceValuation: { findFirst } } as unknown as Partial<TalisonTx>, findFirst };
  }
  const row13 = {
    modelo: "iPhone 13 Pro Max",
    armazenamento: "128GB",
    saudeBateria: "> 90%",
    valor: { toString: () => "2600.00" },
    validadeDias: 1,
  };

  it("recusa (sem transferir) aparelho com iCloud bloqueado", async () => {
    const result = await calcularAvaliacao.execute(
      { categoria: "iphone", modelo: "iPhone 13 Pro Max", bloqueado_icloud: true },
      makeCtx({}),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/não recebemos|NÃO é aceito/i);
      expect(result.reason).toMatch(/NÃO transfira/i);
    }
  });

  it("transfere quando há peça substituída, não funciona ou marcas fortes", async () => {
    for (const args of [
      { peca_substituida: true },
      { tudo_funciona: false },
      { marcas_uso: "fortes" as const },
    ]) {
      const result = await calcularAvaliacao.execute(
        { categoria: "iphone", modelo: "iPhone 13 Pro Max", ...args },
        makeCtx({}),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/atendente|transfira/i);
    }
  });

  it("transfere iPad sem caixa (precisa documento de origem)", async () => {
    const result = await calcularAvaliacao.execute(
      { categoria: "ipad", modelo: "iPad Pro", tem_caixa: false },
      makeCtx({}),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/documento de origem|atendente/i);
  });

  it("mapeia a faixa de bateria e devolve o valor de tabela", async () => {
    const { tx, findFirst } = valuationTx(row13);
    const result = await calcularAvaliacao.execute(
      { categoria: "iphone", modelo: "iPhone 13 Pro Max", armazenamento: "128GB", saude_bateria_percent: 92, tem_caixa: true },
      makeCtx(tx),
    );
    expect(findFirst.mock.calls[0]?.[0]?.where?.saudeBateria).toBe("> 90%");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.valor_final).toBe("R$ 2.600,00");
      expect(result.display).toContain("R$ 2.600,00");
    }
  });

  it("81% cai na faixa 80% - 85%", async () => {
    const { findFirst } = valuationTx(null);
    await calcularAvaliacao.execute(
      { categoria: "iphone", modelo: "iPhone 15 Pro", saude_bateria_percent: 81, tem_caixa: true },
      makeCtx({ deviceValuation: { findFirst } } as unknown as Partial<TalisonTx>),
    );
    expect(findFirst.mock.calls[0]?.[0]?.where?.saudeBateria).toBe("80% - 85%");
  });

  it("aplica -10% sem caixa (iPhone) e -R$100 marcas leves", async () => {
    const { tx } = valuationTx(row13);
    const result = await calcularAvaliacao.execute(
      { categoria: "iphone", modelo: "iPhone 13 Pro Max", armazenamento: "128GB", saude_bateria_percent: 92, tem_caixa: false, marcas_uso: "leves" },
      makeCtx(tx),
    );
    expect(result.ok).toBe(true);
    // 2600 - 10% (260) - 100 = 2240
    if (result.ok) expect(result.data.valor_final).toBe("R$ 2.240,00");
  });

  it("transfere quando o modelo não tem avaliação cadastrada", async () => {
    const { tx } = valuationTx(null);
    const result = await calcularAvaliacao.execute(
      { categoria: "iphone", modelo: "iPhone XPTO", tem_caixa: true },
      makeCtx(tx),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/atendente/i);
  });
});

describe("buscar_aparelho", () => {
  it("lista aparelhos do catálogo com condição, preço PIX e observação", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        name: "iPhone 15 128gb",
        condition: "Novo",
        price: { toString: () => "4599.99" },
        promotionalPrice: { toString: () => "4299.99" },
        description: null,
      },
      {
        name: "iPhone 15 Plus 128gb",
        condition: "Seminovo",
        price: { toString: () => "3299.00" },
        promotionalPrice: null,
        description: "Bateria 83%, bem conservado",
      },
    ]);
    const tx = {
      catalogDevice: { findMany },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarAparelho.execute({ modelo: "iPhone 15" }, makeCtx(tx));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          available: true,
          deletedAt: null,
          name: { contains: "iPhone 15", mode: "insensitive" },
        }),
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.encontrou_exato).toBe(true);
      expect(result.display).toContain("R$ 4.299,99");
      expect(result.display).toContain("R$ 3.299,00");
      expect(result.display).toContain("(Novo)");
      expect(result.display).toContain("(Seminovo)");
      expect(result.display).toContain("Bateria 83%");
      // Preço é PIX/à vista — NÃO pode recalcular desconto sobre ele.
      expect(result.display).toContain("PIX/à vista");
      expect(result.display).toContain("cartão de crédito o valor é maior");
      // 4299.99 * 0.95 = 4084.99 NÃO pode aparecer (não desconta de novo).
      expect(result.display).not.toContain("4.084");
    }
  });

  it("filtra a condição do catálogo sem diferenciar maiúsculas", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const tx = {
      catalogDevice: { findMany },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarAparelho.execute(
      { modelo: "iPhone 15", condicao: "seminovo" },
      makeCtx(tx),
    );

    expect(result.ok).toBe(false);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          condition: { equals: "seminovo", mode: "insensitive" },
        }),
      }),
    );
  });

  it("oferece opções próximas quando não acha o modelo exato", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          name: "iPhone 15 Pro 128GB",
          condition: "Novo",
          price: { toString: () => "5299.99" },
          promotionalPrice: null,
          description: null,
        },
        {
          name: "iPhone 15 128GB",
          condition: "Seminovo",
          price: { toString: () => "4299.99" },
          promotionalPrice: null,
          description: null,
        },
      ]);
    const tx = {
      catalogDevice: { findMany },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarAparelho.execute({ modelo: "iPhone 15 Pro Max 256" }, makeCtx(tx));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.encontrou_exato).toBe(false);
      expect(result.display).toContain("opções próximas disponíveis");
      expect(result.display).toContain("iPhone 15 Pro 128GB");
      expect(result.display).toContain("iPhone 15 128GB");
    }
  });

  it("retorna ok:false quando não há o aparelho (não inventa)", async () => {
    const tx = {
      catalogDevice: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarAparelho.execute({ modelo: "Galaxy S99" }, makeCtx(tx));
    expect(result.ok).toBe(false);
  });
});

describe("buscar_acessorio", () => {
  it("lista acessórios com preço PIX e disponibilidade", async () => {
    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            name: "Capa Galaxy S20 FE",
            salePrice: { toString: () => "49.90" },
            promotionalPrice: null,
            currentStock: 4,
            isSerialized: false,
            hasVariations: false,
            stockItems: [],
            variations: [],
          },
        ]),
      },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarAcessorio.execute({ termo: "capa s20" }, makeCtx(tx));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.display).toContain("R$ 49,90");
      expect(result.display).toContain("R$ 47,40");
      expect(result.display).toContain("em estoque");
      // Link do catálogo público já com a busca aplicada (como no Laravel).
      expect(result.display).toContain("catalogo.arenatechpi.com.br/catalog?q=capa%20s20");
      expect(result.data.link_catalogo).toBe("https://catalogo.arenatechpi.com.br/catalog?q=capa%20s20");
    }
  });

  it("busca também por descrição, sku e marca", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        name: "Adaptador USB-C",
        salePrice: { toString: () => "39.90" },
        promotionalPrice: null,
        currentStock: 1,
        isSerialized: false,
        hasVariations: false,
        stockItems: [],
        variations: [],
      },
    ]);
    const tx = {
      product: { findMany },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarAcessorio.execute({ termo: "adaptador usb" }, makeCtx(tx));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.any(Array),
        }),
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.display).toContain("Adaptador USB-C");
    }
  });

  it("quando não acha por nome exato, oferece o link do catálogo (não nega)", async () => {
    const tx = {
      product: { findMany: vi.fn().mockResolvedValue([]) },
      catalogDevice: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarAcessorio.execute({ termo: "capinha iphone 17" }, makeCtx(tx));
    // Não nega ("não temos"): devolve ok:true com o link pro cliente navegar.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.display).toContain("catalogo.arenatechpi.com.br/catalog?q=capinha%20iphone%2017");
      expect(result.data.link_catalogo).toBeTruthy();
    }
  });

  it("acha no catálogo de aparelhos quando não existe como acessório (figurinha)", async () => {
    const tx = {
      product: { findMany: vi.fn().mockResolvedValue([]) },
      catalogDevice: {
        findMany: vi.fn().mockResolvedValue([
          { name: "Pacote com 7 Figurinhas", condition: "novo", price: "6.59", promotionalPrice: null, description: null },
        ]),
      },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarAcessorio.execute({ termo: "figurinha" }, makeCtx(tx));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.display).toContain("Figurinhas");
  });
});

describe("simular_parcelamento", () => {
  it("calcula parcelas via gross-up usando os tiers do simulador", async () => {
    const tx = {
      simulatorRateConfig: {
        findUnique: vi.fn().mockResolvedValue({
          creditAvistaFeePercent: 0,
          debitFeePercent: 0,
          maxInstallments: 12,
          tiers: [
            { installments: 6, feePercent: 2.99 },
            { installments: 12, feePercent: 5.99 },
          ],
        }),
      },
    } as unknown as Partial<TalisonTx>;

    const result = await simularParcelamento.execute({ valor: 1000 }, makeCtx(tx));
    expect(result.ok).toBe(true);
    if (result.ok) {
      // gross-up 6x @2.99%: 1000*100/97.01 = 1030.82 → parcela 171.80
      expect(result.display).toContain("6x");
      expect(result.display).toContain("12x");
      // não oferta tiers com taxa 0 nem inventa parcelas
      expect(result.data.parcelas).toHaveLength(2);
    }
  });

  it("usa defaults quando o tenant não tem config (não quebra)", async () => {
    const tx = {
      simulatorRateConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as Partial<TalisonTx>;

    const result = await simularParcelamento.execute({ valor: 500 }, makeCtx(tx));
    // defaults têm tiers > 0 → deve simular (ok:true)
    expect(result.ok).toBe(true);
  });
});

describe("qualificar_lead", () => {
  it("cria interesse novo quando não existe lead aberto", async () => {
    const create = vi.fn().mockResolvedValue({ id: "lead-1" });
    const tx = {
      interest: {
        findFirst: vi.fn().mockResolvedValue(null),
        create,
        update: vi.fn(),
      },
    } as unknown as Partial<TalisonTx>;

    const result = await qualificarLead.execute(
      { tipo: "PURCHASE", modelo_interesse: "iPhone 15" },
      makeCtx(tx),
    );
    expect(result.ok).toBe(true);
    expect(create).toHaveBeenCalledOnce();
    if (result.ok) expect(result.data.atualizado).toBe(false);
  });

  it("atualiza o lead existente em vez de duplicar (idempotência)", async () => {
    const update = vi.fn().mockResolvedValue({ id: "lead-1" });
    const create = vi.fn();
    const tx = {
      interest: {
        findFirst: vi.fn().mockResolvedValue({ id: "lead-1" }),
        create,
        update,
      },
    } as unknown as Partial<TalisonTx>;

    const result = await qualificarLead.execute({ tipo: "PURCHASE" }, makeCtx(tx));
    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    if (result.ok) expect(result.data.atualizado).toBe(true);
  });
});

describe("sinalizar_lead_quente", () => {
  it("registra o lead e avisa o grupo quando há grupo configurado", async () => {
    const prev = process.env.TALISON_ALERT_GROUP_JID;
    process.env.TALISON_ALERT_GROUP_JID = "120363@g.us";
    const create = vi.fn().mockResolvedValue({ id: "lead-9" });
    const tx = {
      interest: { findFirst: vi.fn().mockResolvedValue(null), create, update: vi.fn() },
    } as unknown as Partial<TalisonTx>;

    const result = await sinalizarLeadQuente.execute(
      { produto_modelo: "iPhone 16 Pro 256GB", forma_pagamento: "PIX", nome: "João" },
      makeCtx(tx),
    );

    expect(result.ok).toBe(true);
    expect(create).toHaveBeenCalledOnce();
    expect(vi.mocked(sendGroupMessage)).toHaveBeenCalledOnce();
    const [jid, text] = vi.mocked(sendGroupMessage).mock.calls[0]!;
    expect(jid).toBe("120363@g.us");
    expect(text).toContain("iPhone 16 Pro 256GB");
    if (result.ok) expect(result.data.avisou_time).toBe(true);

    process.env.TALISON_ALERT_GROUP_JID = prev;
  });

  it("não duplica o lead e não quebra sem grupo configurado", async () => {
    const prev = process.env.TALISON_ALERT_GROUP_JID;
    delete process.env.TALISON_ALERT_GROUP_JID;
    const update = vi.fn().mockResolvedValue({ id: "lead-9" });
    const create = vi.fn();
    const tx = {
      interest: { findFirst: vi.fn().mockResolvedValue({ id: "lead-9" }), create, update },
    } as unknown as Partial<TalisonTx>;

    const result = await sinalizarLeadQuente.execute(
      { produto_modelo: "PS5 Slim" },
      makeCtx(tx),
    );

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    expect(vi.mocked(sendGroupMessage)).not.toHaveBeenCalled();
    if (result.ok) expect(result.data.avisou_time).toBe(false);

    process.env.TALISON_ALERT_GROUP_JID = prev;
  });
});

describe("transferir_para_humano", () => {
  it("cancela follow-ups e abre a conversa no Chatwoot quando há externalId", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const tx = {
      chatbotFollowUp: { updateMany },
    } as unknown as Partial<TalisonTx>;

    const result = await transferirParaHumano.execute(
      { motivo: "cliente pediu atendente" },
      makeCtx(tx),
    );

    expect(result.ok).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { conversationId: "conv-1", cancelled: false, executedAt: null },
      data: { cancelled: true },
    });
    expect(vi.mocked(toggleStatus)).toHaveBeenCalledWith("42", "open");
  });

  it("não depende de status local HUMAN_TAKEOVER quando não há externalId", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const conversation = { ...baseConversation, externalId: null };
    const tx = {
      chatbotConversation: { update: vi.fn() },
      chatbotFollowUp: { updateMany },
    } as unknown as Partial<TalisonTx>;
    const ctx: TalisonToolContext = {
      tenantId: "tenant-1",
      conversation,
      withTenant: (fn) => fn(tx as TalisonTx),
    };

    const result = await transferirParaHumano.execute({ motivo: "fora do escopo" }, ctx);

    expect(result.ok).toBe(true);
    expect(updateMany).toHaveBeenCalledOnce();
    expect(tx.chatbotConversation?.update).not.toHaveBeenCalled();
    expect(vi.mocked(toggleStatus)).not.toHaveBeenCalledWith(expect.any(String), "open");
  });
});
