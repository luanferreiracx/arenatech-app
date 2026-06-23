import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { createOsServiceProviderPayable } from "@/server/services/os-service-provider-payable.service";

/**
 * Comportamento (ADR 0056): ao pagar uma OS com `serviceProviderId`, gera uma
 * conta a pagar (PAYABLE) da comissao do prestador externo usando
 * `ServiceProvider.commissionRate`. Idempotente; no-op sem prestador, sem taxa
 * ou base <= 0.
 */
function makeTx(opts: {
  provider?: { name: string; commissionRate: Prisma.Decimal | null } | null;
  existingPayable?: { id: string } | null;
}) {
  const created: { financialTransaction: unknown[]; installment: unknown[] } = {
    financialTransaction: [],
    installment: [],
  };
  return {
    _created: created,
    serviceProvider: {
      findFirst: vi.fn().mockResolvedValue(opts.provider ?? null),
    },
    financialTransaction: {
      findFirst: vi.fn().mockResolvedValue(opts.existingPayable ?? null),
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

const order = { id: "os-1", number: "1234", serviceProviderId: "sp-1" };

describe("createOsServiceProviderPayable", () => {
  it("gera PAYABLE + parcela com a comissao do prestador no caminho feliz", async () => {
    const tx = makeTx({ provider: { name: "Tech Reparos", commissionRate: new Prisma.Decimal(10) } });
    // base R$ 100,00 (10000 centavos) a 10% => R$ 10,00
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createOsServiceProviderPayable(tx as any, "tenant-1", order, 10000, "user-1");

    expect(tx.financialTransaction.create).toHaveBeenCalledTimes(1);
    const ft = tx._created.financialTransaction[0] as Record<string, unknown>;
    expect(ft.type).toBe("PAYABLE");
    expect(ft.status).toBe("PENDING");
    expect(ft.supplier).toBe("Tech Reparos");
    expect(ft.serviceOrderId).toBe("os-1");
    expect(ft.referenceType).toBe("service_order_commission");
    expect(ft.referenceId).toBe("os-1");
    expect(Number(ft.totalAmount)).toBe(10);

    expect(tx.installment.create).toHaveBeenCalledTimes(1);
    const inst = tx._created.installment[0] as Record<string, unknown>;
    expect(inst.number).toBe(1);
    expect(inst.status).toBe("PENDING");
    expect(Number(inst.amount)).toBe(10);
  });

  it("arredonda a comissao para centavos inteiros", async () => {
    const tx = makeTx({ provider: { name: "P", commissionRate: new Prisma.Decimal(7.5) } });
    // 3333 centavos a 7,5% = 249,975 centavos => arredonda para 250 => R$ 2,50
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createOsServiceProviderPayable(tx as any, "tenant-1", order, 3333, "user-1");
    const ft = tx._created.financialTransaction[0] as Record<string, unknown>;
    expect(Number(ft.totalAmount)).toBe(2.5);
  });

  it("nao gera nada quando a OS nao tem serviceProviderId", async () => {
    const tx = makeTx({ provider: { name: "P", commissionRate: new Prisma.Decimal(10) } });
    await createOsServiceProviderPayable(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      "tenant-1",
      { id: "os-2", number: "2", serviceProviderId: null },
      10000,
      "user-1",
    );
    expect(tx.serviceProvider.findFirst).not.toHaveBeenCalled();
    expect(tx.financialTransaction.create).not.toHaveBeenCalled();
  });

  it("nao gera nada quando a base e <= 0 (cortesia/garantia)", async () => {
    const tx = makeTx({ provider: { name: "P", commissionRate: new Prisma.Decimal(10) } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createOsServiceProviderPayable(tx as any, "tenant-1", order, 0, "user-1");
    expect(tx.financialTransaction.create).not.toHaveBeenCalled();
  });

  it("nao gera nada quando o prestador nao tem commissionRate", async () => {
    const tx = makeTx({ provider: { name: "P", commissionRate: null } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createOsServiceProviderPayable(tx as any, "tenant-1", order, 10000, "user-1");
    expect(tx.financialTransaction.create).not.toHaveBeenCalled();
  });

  it("e idempotente: nao duplica se ja existe PAYABLE da comissao para a OS", async () => {
    const tx = makeTx({
      provider: { name: "P", commissionRate: new Prisma.Decimal(10) },
      existingPayable: { id: "ft-existing" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createOsServiceProviderPayable(tx as any, "tenant-1", order, 10000, "user-1");
    expect(tx.financialTransaction.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.financialTransaction.create).not.toHaveBeenCalled();
    expect(tx.installment.create).not.toHaveBeenCalled();
  });
});
