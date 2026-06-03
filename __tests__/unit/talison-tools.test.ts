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
import { buscarProduto } from "@/lib/talison/tools/stock";
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

describe("buscar_produto", () => {
  it("lista produtos com preço PIX e disponibilidade", async () => {
    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            name: "Apple iPhone 15 Pro Max 256GB",
            brand: "Apple",
            salePrice: { toString: () => "3700.00" },
            promotionalPrice: null,
            currentStock: 1,
            isDevice: true,
          },
        ]),
      },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarProduto.execute({ termo: "iPhone 15" }, makeCtx(tx));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.display).toContain("R$ 3.700,00");
      expect(result.display).toContain("em estoque");
      expect(result.data.algum_em_estoque).toBe(true);
    }
  });

  it("trata preço zerado como 'sob consulta' (não inventa R$ 0,00)", async () => {
    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            name: "MacBook Air M5",
            brand: "Apple",
            salePrice: { toString: () => "0.00" },
            promotionalPrice: null,
            currentStock: 0,
            isDevice: true,
          },
        ]),
      },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarProduto.execute({ termo: "MacBook" }, makeCtx(tx));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.display).toContain("sob consulta");
      expect(result.display).toContain("sob encomenda");
    }
  });

  it("retorna ok:false quando não há produto (não inventa estoque)", async () => {
    const tx = {
      product: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as Partial<TalisonTx>;

    const result = await buscarProduto.execute({ termo: "xyz inexistente" }, makeCtx(tx));
    expect(result.ok).toBe(false);
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
