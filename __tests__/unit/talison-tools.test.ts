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

import { describe, it, expect, vi } from "vitest";
import type { TalisonToolContext, TalisonTx } from "@/lib/talison/tools/contract";
import { consultarStatusOs, verificarGarantia } from "@/lib/talison/tools/service-order";
import { estimarOrcamento } from "@/lib/talison/tools/catalog";
import { consultarAvaliacao } from "@/lib/talison/tools/valuation";
import { buscarAparelho, buscarAcessorio } from "@/lib/talison/tools/stock";
import { simularParcelamento } from "@/lib/talison/tools/installment";
import { qualificarLead } from "@/lib/talison/tools/handoff";

vi.mock("@/lib/talison/chatwoot-client", () => ({
  sendBotMessage: vi.fn().mockResolvedValue(true),
  toggleStatus: vi.fn().mockResolvedValue(true),
}));

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
  it("lista aparelhos com condição traduzida, preço PIX e observação", async () => {
    const tx = {
      availableDevice: {
        findMany: vi.fn().mockResolvedValue([
          {
            model: "iPhone 15 128gb",
            condition: "NEW",
            price: { toString: () => "4299.99" },
            note: null,
          },
          {
            model: "iPhone 15 Plus 128gb",
            condition: "SEMI_NEW",
            price: { toString: () => "3299.00" },
            note: "Bateria 83%, bem conservado",
          },
        ]),
      },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarAparelho.execute({ modelo: "iPhone 15" }, makeCtx(tx));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.display).toContain("R$ 4.299,99");
      expect(result.display).toContain("(novo)");
      expect(result.display).toContain("(seminovo)");
      expect(result.display).toContain("Bateria 83%");
      // Preço é PIX/à vista — NÃO pode recalcular desconto sobre ele.
      expect(result.display).toContain("PIX/à vista");
      expect(result.display).toContain("cartão de crédito o valor é maior");
      // 4299.99 * 0.95 = 4084.99 NÃO pode aparecer (não desconta de novo).
      expect(result.display).not.toContain("4.084");
    }
  });

  it("retorna ok:false quando não há o aparelho (não inventa)", async () => {
    const tx = {
      availableDevice: { findMany: vi.fn().mockResolvedValue([]) },
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
          },
        ]),
      },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarAcessorio.execute({ termo: "capa s20" }, makeCtx(tx));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.display).toContain("R$ 49,90");
      expect(result.display).toContain("em estoque");
    }
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
