import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  createProviderApuracaoPayable,
  COMMISSION_PAYABLE_DUE_DAY,
} from "@/server/services/provider-apuracao-payable.service";

/**
 * Comportamento (ADR 0056 / épico comissoes): ao fechar a apuracao, gera a conta
 * a pagar canonica — FinancialTransaction PAYABLE + Installment unica. Sem a
 * parcela o financeiro nao listava a comissao no fluxo de contas a pagar.
 */
function makeTx() {
  const created: { financialTransaction: unknown[]; installment: unknown[] } = {
    financialTransaction: [],
    installment: [],
  };
  return {
    _created: created,
    financialTransaction: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const row = { id: "ft-1", ...data };
        created.financialTransaction.push(row);
        return row;
      }),
    },
    installment: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        created.installment.push(data);
        return { id: "inst-1", ...data };
      }),
    },
  };
}

describe("createProviderApuracaoPayable", () => {
  it("cria FinancialTransaction PAYABLE + Installment com os campos canonicos", async () => {
    const tx = makeTx();
    const id = await createProviderApuracaoPayable(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      {
        apuracaoId: "apu-1",
        providerName: "Joao Tecnico",
        netAmount: new Prisma.Decimal(250),
        year: 2026,
        month: 6,
        createdByUserId: "admin-1",
      },
    );

    expect(id).toBe("ft-1");
    expect(tx.financialTransaction.create).toHaveBeenCalledTimes(1);
    const ft = tx._created.financialTransaction[0] as Record<string, unknown>;
    expect(ft.type).toBe("PAYABLE");
    expect(ft.status).toBe("PENDING");
    expect(ft.category).toBe("Comissao de prestador");
    expect(ft.supplier).toBe("Joao Tecnico");
    expect(ft.installmentsTotal).toBe(1);
    expect(ft.referenceType).toBe("provider_apuracao");
    expect(ft.referenceId).toBe("apu-1");
    expect(ft.createdByUserId).toBe("admin-1");
    expect(Number(ft.totalAmount)).toBe(250);
    expect(Number(ft.paidAmount)).toBe(0);

    // Parcela unica com o mesmo valor e vencimento
    expect(tx.installment.create).toHaveBeenCalledTimes(1);
    const inst = tx._created.installment[0] as Record<string, unknown>;
    expect(inst.number).toBe(1);
    expect(inst.status).toBe("PENDING");
    expect(Number(inst.amount)).toBe(250);
    expect((inst.dueDate as Date).getTime()).toBe((ft.dueDate as Date).getTime());
  });

  it("vence no dia 10 do mes seguinte ao periodo apurado", async () => {
    const tx = makeTx();
    await createProviderApuracaoPayable(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      {
        apuracaoId: "apu-1",
        providerName: "P",
        netAmount: new Prisma.Decimal(100),
        year: 2026,
        month: 6, // junho → vence 10/julho
        createdByUserId: null,
      },
    );
    const ft = tx._created.financialTransaction[0] as Record<string, unknown>;
    const due = ft.dueDate as Date;
    expect(due.getMonth()).toBe(6); // 0-indexed: 6 = julho
    expect(due.getDate()).toBe(COMMISSION_PAYABLE_DUE_DAY);
  });
});
