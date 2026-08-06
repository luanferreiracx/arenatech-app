import { TRPCError } from "@trpc/server";
import { withTenant } from "@/server/db";
import { logger } from "@/lib/logger";

/**
 * Registra o opt-out de LGPD de um LEAD.
 *
 * Por que existe (auditoria 2026-08-06, M4-1): o opt-out do sistema vivia só em
 * `Customer.unsubscribed`, e `communication.unsubscribeCustomer` exige
 * `customerId`. Mas **114 dos 119 leads em produção não têm Customer** — são
 * pessoas que demonstraram interesse e nunca compraram.
 *
 * O gate do disparo em massa já estava certo: casa por `customerId` **ou** por
 * telefone, porque "o opt-out é da PESSOA, não do registro" (CL-2). O que
 * faltava era a porta de entrada — se um lead responde "PARE", o operador não
 * tinha onde registrar. As saídas eram criar um Customer fictício só para
 * marcá-lo, ou apagar o lead, o que destrói a prova de que o pedido foi
 * atendido.
 *
 * Idempotente: pedir duas vezes não reescreve a data do primeiro pedido — o
 * carimbo é a evidência de QUANDO a pessoa pediu, e reescrevê-lo apagaria isso.
 */
export async function unsubscribeInterest(args: {
  tenantId: string;
  interestId: string;
  userId: string;
}): Promise<void> {
  await withTenant(args.tenantId, async (tx) => {
    const interest = await tx.interest.findUnique({
      where: { id: args.interestId },
      select: { id: true, unsubscribed: true, customerId: true },
    });
    if (!interest) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Interesse nao encontrado" });
    }
    if (interest.unsubscribed) return; // já registrado — preserva a data original

    await tx.interest.update({
      where: { id: args.interestId },
      data: { unsubscribed: true, unsubscribedAt: new Date() },
    });
  });

  logger.info("Lead descadastrado (LGPD)", {
    interestId: args.interestId,
    userId: args.userId,
  });
}
