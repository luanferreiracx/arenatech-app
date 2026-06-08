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
import { consultarAvaliacao } from "@/lib/talison/tools/valuation";
import { buscarAparelho, buscarAcessorio } from "@/lib/talison/tools/stock";
import { simularParcelamento } from "@/lib/talison/tools/installment";
import { qualificarLead, transferirParaHumano } from "@/lib/talison/tools/handoff";
import { toggleStatus } from "@/lib/talison/chatwoot-client";

vi.mock("@/lib/talison/chatwoot-client", () => ({
  sendBotMessage: vi.fn().mockResolvedValue(true),
  toggleStatus: vi.fn().mockResolvedValue(true),
}));

beforeEach(() => {
  vi.mocked(toggleStatus).mockClear();
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
});

describe("consultar_avaliacao", () => {
  it("devolve valor de trade-in formatado e validade", async () => {
    const tx = {
      deviceValuation: {
        findFirst: vi.fn().mockResolvedValue({
          modelo: "iPhone 13 Pro",
          armazenamento: "128GB",
          saudeBateria: "89%",
          valor: { toString: () => "3500.00" },
          validadeDias: 7,
        }),
      },
    } as unknown as Partial<TalisonTx>;

    const result = await consultarAvaliacao.execute({ modelo: "iPhone 13 Pro" }, makeCtx(tx));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.valor).toBe("R$ 3.500,00");
      expect(result.display).toContain("7 dias");
    }
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

  it("retorna ok:false quando o item não está disponível no catálogo visível", async () => {
    const tx = {
      product: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarAcessorio.execute({ termo: "capa s20" }, makeCtx(tx));
    expect(result.ok).toBe(false);
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
