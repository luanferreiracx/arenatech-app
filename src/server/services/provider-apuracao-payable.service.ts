import { Prisma } from "@prisma/client";

// `any` para suportar PrismaClient e o tx de withTenant — padrao do repo.
type TxClient = any;

/** Dia do mes seguinte em que vence a conta a pagar da comissao (aguarda NFS-e). */
export const COMMISSION_PAYABLE_DUE_DAY = 10;

type ApuracaoPayableInput = {
  apuracaoId: string;
  providerName: string;
  netAmount: Prisma.Decimal;
  year: number;
  month: number;
  createdByUserId: string | null;
};

/**
 * Gera a conta a pagar (PAYABLE) canonica ao fechar a apuracao do prestador:
 * FinancialTransaction + Installment unica, espelhando o padrao do
 * os-service-provider-payable (categoria, supplier, paidAmount, installmentsTotal,
 * referencia, parcela). Sem a parcela o financeiro nao lista a comissao no fluxo
 * de contas a pagar (o bug que este service corrige — ADR 0056 / épico comissoes).
 *
 * Retorna o id da FinancialTransaction. Assume netAmount > 0 (o caller decide se
 * ha valor a pagar). Vencimento = dia 10 do mes seguinte ao periodo apurado.
 */
export async function createProviderApuracaoPayable(
  tx: TxClient,
  tenantId: string,
  input: ApuracaoPayableInput,
): Promise<string> {
  const monthLabel = `${String(input.month).padStart(2, "0")}/${input.year}`;
  const dueDate = new Date(input.year, input.month, COMMISSION_PAYABLE_DUE_DAY);

  const payable = await tx.financialTransaction.create({
    data: {
      tenantId,
      type: "PAYABLE",
      status: "PENDING",
      description: `Comissao ${input.providerName} — ${monthLabel}`,
      category: "Comissao de prestador",
      supplier: input.providerName,
      totalAmount: input.netAmount,
      paidAmount: new Prisma.Decimal(0),
      installmentsTotal: 1,
      dueDate,
      emissionDate: new Date(),
      referenceType: "provider_apuracao",
      referenceId: input.apuracaoId,
      createdByUserId: input.createdByUserId,
      notes: `Apuracao #${input.apuracaoId}. Aguardando NFS-e do prestador.`,
    },
  });

  await tx.installment.create({
    data: {
      tenantId,
      transactionId: payable.id,
      number: 1,
      amount: input.netAmount,
      dueDate,
      status: "PENDING",
    },
  });

  return payable.id;
}
