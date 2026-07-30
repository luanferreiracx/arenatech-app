import type { Prisma } from "@prisma/client";
import { phoneMatchKey } from "@/lib/validators/customer";
import { logger } from "@/lib/logger";

/**
 * Vínculo automático de conversão de interesse (auditoria interesses 2026-07-11, B2).
 *
 * Quando uma venda é finalizada ou uma OS é criada para um telefone que casa
 * com um interesse ABERTO (WAITING/CONTACTED), o interesse é marcado como
 * COMPLETED + convertedAt + ref (saleId/osId). Assim `conversionStats` deixa de
 * ser sempre zero e o operador vê o funil real.
 *
 * Regras de robustez:
 * - Só casa interesse ABERTO (não mexe em COMPLETED/CANCELLED — respeita B4).
 * - Se houver mais de um aberto no mesmo telefone, converte o MAIS ANTIGO
 *   (fila: o interesse que esperava há mais tempo).
 * - Telefone comparado só-dígitos (o interest já é armazenado assim desde o PR1;
 *   o telefone da venda/OS pode vir com máscara → normaliza aqui).
 * - Best-effort: nunca derruba a venda/OS. Um erro aqui é logado e engolido —
 *   conversão é métrica, não transação financeira.
 *
 * Roda DENTRO da tx da venda/OS (recebe o tx client) para ser atômico com ela.
 */
export async function linkInterestConversionByPhone(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    phone: string | null | undefined;
    saleId?: string;
    osId?: string;
    customerId?: string | null;
  },
): Promise<string | null> {
  // CL-1: era igualdade exata contra `interest.phone`, e por isso NUNCA casava.
  // O mesmo telefone é gravado em formatos diferentes conforme a origem (painel,
  // bot do WhatsApp, cadastro de cliente). Medido em produção: dos 75 interesses
  // abertos, nenhum tinha os 11 dígitos usados por 1.278 dos 1.384 clientes — e 6
  // pertenciam a clientes que compraram ou abriram OS depois de virar lead. O
  // funil marcava 0% de conversão com pelo menos 8% real.
  //
  // A chave são os últimos 8 dígitos (o número do assinante). `endsWith` funciona
  // porque a coluna é normalizada só-dígitos na escrita e no backfill — sem isso
  // um telefone mascarado terminaria em "9999" e escaparia de novo.
  const key = phoneMatchKey(params.phone);
  if (!key) return null;

  try {
    const open = await tx.interest.findFirst({
      where: {
        tenantId: params.tenantId,
        phone: { endsWith: key },
        status: { in: ["WAITING", "CONTACTED"] },
      },
      orderBy: { createdAt: "asc" }, // o mais antigo primeiro (fila)
      select: { id: true },
    });
    if (!open) return null;

    await tx.interest.update({
      where: { id: open.id },
      data: {
        status: "COMPLETED",
        convertedAt: new Date(),
        convertedToSaleId: params.saleId ?? null,
        convertedToOsId: params.osId ?? null,
        // Aproveita p/ vincular ao cliente quando a venda/OS tem um.
        ...(params.customerId ? { customerId: params.customerId } : {}),
      },
    });

    logger.info("Interest auto-converted", {
      interestId: open.id,
      saleId: params.saleId,
      osId: params.osId,
    });
    return open.id;
  } catch (err) {
    // Best-effort: métrica não pode derrubar a venda/OS.
    logger.error("Interest auto-conversion failed", {
      tenantId: params.tenantId,
      saleId: params.saleId,
      osId: params.osId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
