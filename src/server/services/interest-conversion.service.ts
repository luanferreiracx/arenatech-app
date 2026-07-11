import type { Prisma } from "@prisma/client";
import { normalizePhoneDigits } from "@/lib/validators/customer";
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
  const digits = params.phone ? normalizePhoneDigits(params.phone) : "";
  // Telefone curto demais não é chave confiável — evita falso-positivo.
  if (digits.length < 8) return null;

  try {
    const open = await tx.interest.findFirst({
      where: {
        tenantId: params.tenantId,
        phone: digits,
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
