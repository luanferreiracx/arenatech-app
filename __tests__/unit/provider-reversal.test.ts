import { describe, it, expect, vi } from "vitest";
import { createProviderReversalForRefund } from "@/server/services/provider-reversal.service";

/**
 * Comportamento (ADR 0056, epico comissoes): ao estornar uma venda/OS
 * comissionada, gera um ProviderReversal para nao pagar comissao sobre
 * transacao desfeita — mas SO se a apuracao do mes do fato ja estiver fechada
 * (senao o re-calculo ja exclui a venda/OS). Valor = comissao creditada
 * (lida da memoryJson) x fracao estornada. Idempotente.
 */

type ApuracaoStub = { status: string; memoryJson: unknown } | null;

function makeTx(opts: {
  provider?: { id: string } | null;
  existingReversal?: { id: string } | null;
  apuracao?: ApuracaoStub;
}) {
  const created: unknown[] = [];
  return {
    _created: created,
    provider: {
      findFirst: vi.fn().mockResolvedValue(opts.provider ?? null),
    },
    providerReversal: {
      findFirst: vi.fn().mockResolvedValue(opts.existingReversal ?? null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        created.push(data);
        return { id: "rev-1", ...data };
      }),
    },
    providerApuracao: {
      findFirst: vi.fn().mockResolvedValue(opts.apuracao ?? null),
    },
  };
}

const closedApuracaoWith = (referenceId: string, comissao: number): ApuracaoStub => ({
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
  refundedFraction: 1,
  registeredById: "admin-1",
};

describe("createProviderReversalForRefund", () => {
  it("gera reversal com a comissao creditada quando a apuracao esta fechada", async () => {
    const tx = makeTx({
      provider: { id: "prov-1" },
      apuracao: closedApuracaoWith("sale-1", 30),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createProviderReversalForRefund(tx as any, "tenant-1", baseInput);

    expect(tx.providerReversal.create).toHaveBeenCalledTimes(1);
    const rev = tx._created[0] as Record<string, unknown>;
    expect(Number(rev.amount)).toBe(30);
    expect(rev.referenceType).toBe("sale");
    expect(rev.referenceId).toBe("sale-1");
    expect(rev.type).toBe("RETURN_SAME_MONTH");
  });

  it("reverte proporcionalmente em estorno parcial", async () => {
    const tx = makeTx({
      provider: { id: "prov-1" },
      apuracao: closedApuracaoWith("sale-1", 30),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createProviderReversalForRefund(tx as any, "tenant-1", { ...baseInput, refundedFraction: 0.5 });
    const rev = tx._created[0] as Record<string, unknown>;
    expect(Number(rev.amount)).toBe(15);
  });

  it("nao gera nada quando a apuracao ainda esta aberta (re-calculo resolve)", async () => {
    const tx = makeTx({
      provider: { id: "prov-1" },
      apuracao: { status: "OPEN", memoryJson: closedApuracaoWith("sale-1", 30)!.memoryJson },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createProviderReversalForRefund(tx as any, "tenant-1", baseInput);
    expect(tx.providerReversal.create).not.toHaveBeenCalled();
  });

  it("nao gera nada quando nao ha apuracao no mes do fato", async () => {
    const tx = makeTx({ provider: { id: "prov-1" }, apuracao: null });
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

  it("e idempotente: nao duplica reversal para o mesmo fato", async () => {
    const tx = makeTx({
      provider: { id: "prov-1" },
      existingReversal: { id: "rev-existing" },
      apuracao: closedApuracaoWith("sale-1", 30),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createProviderReversalForRefund(tx as any, "tenant-1", baseInput);
    expect(tx.providerApuracao.findFirst).not.toHaveBeenCalled();
    expect(tx.providerReversal.create).not.toHaveBeenCalled();
  });

  it("nao gera nada quando a comissao creditada sobre o fato foi zero", async () => {
    const tx = makeTx({
      provider: { id: "prov-1" },
      apuracao: closedApuracaoWith("outro-fato", 30), // sale-1 nao esta na memoria
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createProviderReversalForRefund(tx as any, "tenant-1", baseInput);
    expect(tx.providerReversal.create).not.toHaveBeenCalled();
  });

  it("nao gera nada sem providerUserId ou com fracao <= 0", async () => {
    const tx = makeTx({ provider: { id: "prov-1" }, apuracao: closedApuracaoWith("sale-1", 30) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createProviderReversalForRefund(tx as any, "tenant-1", { ...baseInput, providerUserId: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createProviderReversalForRefund(tx as any, "tenant-1", { ...baseInput, refundedFraction: 0 });
    expect(tx.provider.findFirst).not.toHaveBeenCalled();
    expect(tx.providerReversal.create).not.toHaveBeenCalled();
  });

  it("usa RETURN_LATER_MONTH quando o fato foi em mes anterior", async () => {
    const tx = makeTx({
      provider: { id: "prov-1" },
      apuracao: closedApuracaoWith("sale-1", 30),
    });
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 2);
    await createProviderReversalForRefund(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { ...baseInput, factDate: lastMonth },
    );
    const rev = tx._created[0] as Record<string, unknown>;
    expect(rev.type).toBe("RETURN_LATER_MONTH");
  });
});
