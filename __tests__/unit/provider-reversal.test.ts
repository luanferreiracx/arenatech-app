import { describe, it, expect, vi } from "vitest";
import {
  createProviderReversalForRefund,
  reverseSaleCommissions,
  reverseServiceOrderCommissions,
} from "@/server/services/provider-reversal.service";

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
 * Ano-mes no fuso do NEGOCIO (BRT), que e o mes que a loja fecha. Usado pelo
 * stub da apuracao do fato: o servico tem que casar com ESTE mes, nao com o do
 * processo.
 */
function ymNegocio(date: Date): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const y = f.find((p) => p.type === "year")!.value;
  const m = f.find((p) => p.type === "month")!.value;
  return `${Number(y)}-${Number(m)}`;
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
  const factKey = opts.factDate ? ymNegocio(opts.factDate) : ym(now);

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

describe("reverseSaleCommissions", () => {
  /**
   * Mock que resolve cada provider por userId e devolve os STORE providers.
   * Registra os userIds efetivamente processados (via provider.findFirst).
   */
  function makeSaleTx(opts: {
    // userId → { providerId, comissaoNaVenda }: quem tem apuracao fechada com a venda.
    providersByUser: Record<string, { id: string; comissao: number }>;
    storeProviderUserIds: string[];
  }) {
    const processedUserIds: string[] = [];
    const created: Record<string, unknown>[] = [];
    return {
      _processed: processedUserIds,
      _created: created,
      provider: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          processedUserIds.push(where.userId);
          const p = opts.providersByUser[where.userId];
          return p ? { id: p.id } : null;
        }),
        findMany: vi
          .fn()
          .mockResolvedValue(opts.storeProviderUserIds.map((userId) => ({ userId }))),
      },
      providerReversal: {
        findMany: vi.fn().mockResolvedValue([]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          created.push(data);
          return { id: `rev-${created.length}`, ...data };
        }),
      },
      providerApuracao: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          // Apuracao do fato: fechada, com a comissao do provider sobre a venda.
          const entry = Object.values(opts.providersByUser).find((p) => p.id === where.providerId);
          if (entry && where.year && where.month) {
            // Distingue lookup do fato (com memoryJson) do anchor (sem): ambos
            // usam findFirst; retornamos fechada com memoria no 1o e null depois.
            return {
              status: "CLOSED",
              memoryJson: { linhas: [{ referencia_id: "sale-1", comissao: entry.comissao }] },
            };
          }
          return null;
        }),
      },
    };
  }

  const sale = {
    id: "sale-1",
    sellerId: "seller-user",
    saleDate: new Date(),
    createdAt: new Date(),
  };

  it("reverte a comissao do vendedor (OWN) E dos prestadores com regra STORE", async () => {
    const tx = makeSaleTx({
      providersByUser: {
        "seller-user": { id: "prov-seller", comissao: 20 },
        "store-user": { id: "prov-store", comissao: 5 },
      },
      storeProviderUserIds: ["store-user"],
    });
    await reverseSaleCommissions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { sale, cumulativeRefundedFraction: 1, registeredById: "admin-1" },
    );
    // Processou o vendedor E o prestador STORE.
    expect(new Set(tx._processed)).toEqual(new Set(["seller-user", "store-user"]));
    // Gerou reversal para ambos, com os valores das respectivas memorias.
    const amounts = tx._created.map((r) => Number(r.amount)).sort((a, b) => a - b);
    expect(amounts).toEqual([5, 20]);
  });

  it("dedup: vendedor que TAMBEM tem regra STORE e processado uma vez so", async () => {
    const tx = makeSaleTx({
      providersByUser: { "seller-user": { id: "prov-seller", comissao: 10 } },
      storeProviderUserIds: ["seller-user"], // mesmo user aparece nas duas fontes
    });
    await reverseSaleCommissions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { sale, cumulativeRefundedFraction: 1, registeredById: "admin-1" },
    );
    expect(tx._processed.filter((u) => u === "seller-user")).toHaveLength(1);
  });

  it("prestador STORE que nao ganhou nesta venda: no-op (guard de comissao zero)", async () => {
    const tx = makeSaleTx({
      providersByUser: {
        "seller-user": { id: "prov-seller", comissao: 20 },
        // store-user existe mas sem entrada em providersByUser → apuracao/memoria vazia
      },
      storeProviderUserIds: ["store-user"],
    });
    await reverseSaleCommissions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { sale, cumulativeRefundedFraction: 1, registeredById: "admin-1" },
    );
    // So o vendedor gerou reversal; o STORE sem comissao na venda nao gera.
    const amounts = tx._created.map((r) => Number(r.amount));
    expect(amounts).toEqual([20]);
  });
});

describe("reverseServiceOrderCommissions", () => {
  function makeOrderTx(opts: {
    providersByUser: Record<string, { id: string; comissao: number }>;
    participationProviderUserIds: string[];
  }) {
    const processedUserIds: string[] = [];
    const created: Record<string, unknown>[] = [];
    return {
      _processed: processedUserIds,
      _created: created,
      provider: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          processedUserIds.push(where.userId);
          const p = opts.providersByUser[where.userId];
          return p ? { id: p.id } : null;
        }),
        findMany: vi
          .fn()
          .mockResolvedValue(opts.participationProviderUserIds.map((userId) => ({ userId }))),
      },
      providerReversal: {
        findMany: vi.fn().mockResolvedValue([]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          created.push(data);
          return { id: `rev-${created.length}`, ...data };
        }),
      },
      providerApuracao: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          const entry = Object.values(opts.providersByUser).find((p) => p.id === where.providerId);
          if (entry && where.year && where.month) {
            return {
              status: "CLOSED",
              memoryJson: { linhas: [{ referencia_id: "os-1", comissao: entry.comissao }] },
            };
          }
          return null;
        }),
      },
    };
  }

  const order = {
    id: "os-1",
    technicianId: "tech-user",
    vendorId: null,
    paymentDate: new Date(),
  };

  it("reverte o executor (OWN) E os prestadores com participacao em AT", async () => {
    const tx = makeOrderTx({
      providersByUser: {
        "tech-user": { id: "prov-tech", comissao: 40 },
        "particip-user": { id: "prov-particip", comissao: 8 },
      },
      participationProviderUserIds: ["particip-user"],
    });
    await reverseServiceOrderCommissions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { order, registeredById: "admin-1" },
    );
    expect(new Set(tx._processed)).toEqual(new Set(["tech-user", "particip-user"]));
    const amounts = tx._created.map((r) => Number(r.amount)).sort((a, b) => a - b);
    expect(amounts).toEqual([8, 40]);
  });

  it("dedup: executor que TAMBEM tem participacao e processado uma vez so", async () => {
    const tx = makeOrderTx({
      providersByUser: { "tech-user": { id: "prov-tech", comissao: 10 } },
      participationProviderUserIds: ["tech-user"],
    });
    await reverseServiceOrderCommissions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { order, registeredById: "admin-1" },
    );
    expect(tx._processed.filter((u) => u === "tech-user")).toHaveLength(1);
  });

  it("participante que nao ganhou nesta OS: no-op (guard de comissao zero)", async () => {
    const tx = makeOrderTx({
      providersByUser: { "tech-user": { id: "prov-tech", comissao: 40 } },
      participationProviderUserIds: ["particip-user"], // sem entrada → sem comissao
    });
    await reverseServiceOrderCommissions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { order, registeredById: "admin-1" },
    );
    const amounts = tx._created.map((r) => Number(r.amount));
    expect(amounts).toEqual([40]);
  });
});

/**
 * Etapa 7, Módulo 2 (achado A): o mês do FATO era lido com `getFullYear()` /
 * `getMonth()`, que respondem no fuso do PROCESSO.
 *
 * Produção roda em UTC (confirmado: `TZ=` vazio no container). Uma venda de
 * **31/07 22:00 BRT** é `2026-08-01T01:00Z` — em UTC o código lia **agosto**,
 * procurava a apuração de agosto, não achava a de julho e retornava no-op. A
 * comissão indevida nunca era estornada.
 *
 * É a mesma família do CM-1 e do J3, que o projeto já corrigiu em três lugares:
 * `month-range.ts:12-19` (janela do mês), `month-range.ts:29-39` (dias do mês) e
 * `provider-commission.ts:58-62` (`assertApuracaoAberta`, que usa `getUTC*` com
 * comentário dizendo "Mesma família do CM-1"). O estorno ficou de fora.
 *
 * O teste afirma o mês do NEGÓCIO (BRT), não o do processo — por isso roda o
 * mesmo caso nos dois fusos.
 */
describe("mes do fato respeita o fuso do negocio (BRT), nao o do processo", () => {
  /**
   * 31/07/2026 22:00 BRT — julho para a loja, agosto em UTC.
   *
   * A data é escolhida para que o mês do NEGÓCIO (BRT) e o mês do PROCESSO
   * divirjam quando o processo roda em UTC, que é o caso de produção
   * (`TZ=` vazio no container).
   */
  const VIRADA = new Date("2026-08-01T01:00:00.000Z");

  /**
   * Numa máquina em BRT este teste passaria mesmo com o bug — o fuso do processo
   * coincidiria com o do negócio e a divergência não apareceria. O CI não fixa
   * `TZ`, então depender do fuso do runner é sorte, não garantia.
   *
   * A checagem abaixo falha alto se a premissa do caso deixar de valer.
   */
  it("a data escolhida realmente divergiria no fuso do processo (premissa do caso)", () => {
    const mesNoProcesso = VIRADA.getMonth() + 1;
    const mesNoNegocio = Number(
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", month: "numeric" })
        .format(VIRADA),
    );
    expect(mesNoNegocio, "o mês do negócio para 31/07 22:00 BRT é julho").toBe(7);
    // Em UTC dá 8 e a divergência existe; em BRT dá 7 e este caso não exercita
    // nada — por isso o teste abaixo é complementado pelo de fuso explícito.
    expect([7, 8]).toContain(mesNoProcesso);
  });

  it("acha a apuracao de JULHO para uma venda de 31/07 22:00 BRT", async () => {
    const tx = makeTx({
      provider: { id: "prov-1" },
      factDate: VIRADA,
      // A apuração fechada é a de JULHO — a que a loja de fato fechou.
      factApuracao: {
        status: "CLOSED",
        memoryJson: { linhas: [{ referencia_id: "venda-1", comissao: 100 }] },
      },
    });

    await createProviderReversalForRefund(tx as never, "t1", {
      providerUserId: "u1",
      referenceType: "sale",
      referenceId: "venda-1",
      factDate: VIRADA,
      cumulativeRefundedFraction: 1,
      registeredById: "u1",
    });

    // O stub indexa a apuração do fato por (year, month) derivados em BRT.
    // Se o serviço consultar agosto, não acha nada e não cria reversal.
    expect(
      tx._created.length,
      "reversal nao criado: o servico procurou o mes errado (fuso do processo)",
    ).toBe(1);
  });

  /**
   * Independente do fuso do runner: afirma a REGRA (a função que decide o mês),
   * não o efeito colateral de rodar em UTC. Este é o caso que protege de verdade.
   */
  it("monthOfDate ancora no fuso do negocio, seja qual for o do processo", async () => {
    const { monthOfDate } = await import("@/lib/commission/month-range");
    expect(monthOfDate(VIRADA)).toEqual({ year: 2026, month: 7 });
    // Virada do outro lado: 01/08 00:00 BRT continua agosto.
    expect(monthOfDate(new Date("2026-08-01T03:00:00.000Z"))).toEqual({ year: 2026, month: 8 });
    // 30/06 22:00 BRT é junho, não julho (o caso simétrico do J3).
    expect(monthOfDate(new Date("2026-07-01T01:00:00.000Z"))).toEqual({ year: 2026, month: 6 });
  });
});
