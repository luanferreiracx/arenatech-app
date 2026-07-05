import { describe, it, expect, vi } from "vitest";
import { createProviderReversalForRefund } from "@/server/services/provider-reversal.service";

/**
 * Comportamento (ADR 0056, epico comissoes): ao estornar uma venda/OS
 * comissionada, gera um ProviderReversal para nao pagar comissao sobre
 * transacao desfeita — SO se a apuracao do mes do FATO ja estiver fechada
 * (senao o re-calculo ja exclui a venda/OS). Valor = comissao creditada
 * (lida da memoryJson) x fracao ACUMULADA estornada, revertendo so o DELTA
 * ainda nao revertido. Ancorado no primeiro mes com apuracao ainda ABERTA.
 */

type ApuracaoStub = { status: string; memoryJson?: unknown };

function ym(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}`;
}

/**
 * @param factApuracao apuracao do mes do FATO (status + memoryJson).
 * @param existingReversals reversals ja existentes para o fato (amounts).
 * @param anchorClosedMonths meses (offset a partir do mes corrente) cuja apuracao
 *   esta FECHADA — usados para testar o walk-forward do anchor. 0 = mes corrente.
 */
function makeTx(opts: {
  provider?: { id: string } | null;
  factApuracao?: ApuracaoStub | null;
  factDate?: Date;
  existingReversals?: number[];
  anchorClosedMonths?: number[];
}) {
  const created: Record<string, unknown>[] = [];
  const now = new Date();
  const factKey = opts.factDate ? ym(opts.factDate) : ym(now);

  // Monta o mapa year-month → apuracao para os meses de anchor fechados.
  const closedAnchorKeys = new Set(
    (opts.anchorClosedMonths ?? []).map((offset) => {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      return ym(d);
    }),
  );

  return {
    _created: created,
    provider: {
      findFirst: vi.fn().mockResolvedValue(opts.provider ?? null),
    },
    providerReversal: {
      findMany: vi.fn().mockResolvedValue(
        (opts.existingReversals ?? []).map((amount) => ({ amount })),
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        created.push(data);
        return { id: `rev-${created.length}`, ...data };
      }),
    },
    providerApuracao: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        const key = `${where.year}-${where.month}`;
        // Lookup da apuracao do FATO.
        if (key === factKey && opts.factApuracao !== undefined) {
          return opts.factApuracao;
        }
        // Lookup do anchor: meses marcados como fechados retornam CLOSED.
        if (closedAnchorKeys.has(key)) return { status: "CLOSED" };
        // Demais meses: sem apuracao (aberto) → anchor para aqui.
        return null;
      }),
    },
  };
}

const closedFactApuracao = (referenceId: string, comissao: number): ApuracaoStub => ({
  status: "CLOSED",
  memoryJson: {
    linhas: [
      { referencia_id: referenceId, comissao },
      { referencia_id: "outra-venda", comissao: 999 },
    ],
  },
});

const baseInput = {
  providerUserId: "user-1",
  referenceType: "sale" as const,
  referenceId: "sale-1",
  factDate: new Date(),
  cumulativeRefundedFraction: 1,
  registeredById: "admin-1",
};

describe("createProviderReversalForRefund", () => {
  it("gera reversal com a comissao creditada quando a apuracao do fato esta fechada", async () => {
    // Fato no mes corrente, mas apuracao ja fechada → anchor pula pro proximo mes
    // aberto (BUG-1). Como o anchor difere do mes do fato, o tipo e LATER_MONTH.
    const tx = makeTx({ provider: { id: "prov-1" }, factApuracao: closedFactApuracao("sale-1", 30) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createProviderReversalForRefund(tx as any, "tenant-1", baseInput);

    expect(tx.providerReversal.create).toHaveBeenCalledTimes(1);
    const rev = tx._created[0]!;
    expect(Number(rev.amount)).toBe(30);
    expect(rev.referenceType).toBe("sale");
    expect(rev.referenceId).toBe("sale-1");
    expect(rev.type).toBe("RETURN_LATER_MONTH");
  });

  it("reverte proporcionalmente em estorno parcial (fracao acumulada)", async () => {
    const tx = makeTx({ provider: { id: "prov-1" }, factApuracao: closedFactApuracao("sale-1", 30) });
    await createProviderReversalForRefund(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { ...baseInput, cumulativeRefundedFraction: 0.5 },
    );
    expect(Number(tx._created[0]!.amount)).toBe(15);
  });

  it("BUG-4: parciais sucessivos somam — reverte so o DELTA ja nao revertido", async () => {
    // 1o parcial: 40% de 100 = 40 ja revertido. 2o parcial acumulado 70% → alvo 70,
    // delta = 70 - 40 = 30.
    const tx = makeTx({
      provider: { id: "prov-1" },
      factApuracao: closedFactApuracao("sale-1", 100),
      existingReversals: [40],
    });
    await createProviderReversalForRefund(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { ...baseInput, cumulativeRefundedFraction: 0.7 },
    );
    expect(tx.providerReversal.create).toHaveBeenCalledTimes(1);
    expect(Number(tx._created[0]!.amount)).toBe(30);
  });

  it("idempotente: retry do mesmo estorno (delta <= 0) e no-op", async () => {
    // Alvo 50, ja revertido 50 → delta 0 → nao cria.
    const tx = makeTx({
      provider: { id: "prov-1" },
      factApuracao: closedFactApuracao("sale-1", 100),
      existingReversals: [50],
    });
    await createProviderReversalForRefund(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { ...baseInput, cumulativeRefundedFraction: 0.5 },
    );
    expect(tx.providerReversal.create).not.toHaveBeenCalled();
  });

  it("BUG-1: mes corrente ja fechado → ancora o reversal no proximo mes ABERTO", async () => {
    // Fato num mes anterior fechado; mes corrente (offset 0) tambem fechado; o
    // proximo (offset 1) esta aberto → anchor cai no mes seguinte.
    const factDate = new Date();
    factDate.setMonth(factDate.getMonth() - 1);
    const tx = makeTx({
      provider: { id: "prov-1" },
      factDate,
      factApuracao: closedFactApuracao("sale-1", 30),
      anchorClosedMonths: [0], // mes corrente fechado
    });
    await createProviderReversalForRefund(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { ...baseInput, factDate },
    );
    expect(tx.providerReversal.create).toHaveBeenCalledTimes(1);
    const rev = tx._created[0]!;
    const anchor = rev.factDate as Date;
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    // Anchor caiu no proximo mes (aberto), nao no mes corrente (fechado).
    expect(anchor.getMonth()).toBe(nextMonth.getMonth());
  });

  it("nao gera nada quando a apuracao do fato ainda esta aberta", async () => {
    const tx = makeTx({ provider: { id: "prov-1" }, factApuracao: { status: "OPEN" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createProviderReversalForRefund(tx as any, "tenant-1", baseInput);
    expect(tx.providerReversal.create).not.toHaveBeenCalled();
  });

  it("nao gera nada quando nao ha apuracao no mes do fato", async () => {
    const tx = makeTx({ provider: { id: "prov-1" }, factApuracao: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createProviderReversalForRefund(tx as any, "tenant-1", baseInput);
    expect(tx.providerReversal.create).not.toHaveBeenCalled();
  });

  it("nao gera nada quando o usuario nao e Provider", async () => {
    const tx = makeTx({ provider: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createProviderReversalForRefund(tx as any, "tenant-1", baseInput);
    expect(tx.providerApuracao.findFirst).not.toHaveBeenCalled();
    expect(tx.providerReversal.create).not.toHaveBeenCalled();
  });

  it("nao gera nada quando a comissao creditada sobre o fato foi zero", async () => {
    const tx = makeTx({
      provider: { id: "prov-1" },
      factApuracao: closedFactApuracao("outro-fato", 30), // sale-1 nao esta na memoria
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createProviderReversalForRefund(tx as any, "tenant-1", baseInput);
    expect(tx.providerReversal.create).not.toHaveBeenCalled();
  });

  it("nao gera nada sem providerUserId ou com fracao <= 0", async () => {
    const tx = makeTx({ provider: { id: "prov-1" }, factApuracao: closedFactApuracao("sale-1", 30) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createProviderReversalForRefund(tx as any, "tenant-1", { ...baseInput, providerUserId: null });
    await createProviderReversalForRefund(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { ...baseInput, cumulativeRefundedFraction: 0 },
    );
    expect(tx.provider.findFirst).not.toHaveBeenCalled();
    expect(tx.providerReversal.create).not.toHaveBeenCalled();
  });

  it("usa RETURN_LATER_MONTH quando o fato foi em mes anterior e o anchor cai no mes corrente", async () => {
    const factDate = new Date();
    factDate.setMonth(factDate.getMonth() - 2);
    const tx = makeTx({
      provider: { id: "prov-1" },
      factDate,
      factApuracao: closedFactApuracao("sale-1", 30),
    });
    await createProviderReversalForRefund(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { ...baseInput, factDate },
    );
    expect(tx._created[0]!.type).toBe("RETURN_LATER_MONTH");
  });
});
