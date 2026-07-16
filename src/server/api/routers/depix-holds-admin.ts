/**
 * Router de REVISAO HUMANA dos saques externos RETIDOS (HELD) — SUPER-ADMIN.
 * Acessivel via /admin/depix-holds.
 *
 * Decisao do dono: no saque externo, nenhum reembolso se move sozinho. Quando o
 * inbound do tenant nao pode ser repassado (valor divergente / janela vencida / sem
 * gas / inesperado), o DePix fica SEGURO na arena-fees em estado HELD e um humano
 * decide aqui:
 *   - list:    saques HELD com recebido/esperado/motivo + endereco allowlisted.
 *   - refund:  devolve o valor recebido pro endereco allowlisted do tenant (unico
 *              destino permitido — verificado por 2FA+email+WhatsApp na Fase A).
 *   - resolve: fecha o registro sem mover dinheiro (tratado fora da plataforma).
 */
import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import {
  listHeldWithdraws,
  refundHeldWithdraw,
  resolveHeldWithdraw,
} from "@/server/services/depix-transaction.service";

export const depixHoldsAdminRouter = createTRPCRouter({
  list: adminProcedure.query(async () => listHeldWithdraws()),

  refund: adminProcedure
    .input(z.object({ withdrawId: z.string().uuid() }))
    .mutation(async ({ input }) => refundHeldWithdraw(input.withdrawId)),

  resolve: adminProcedure
    .input(z.object({ withdrawId: z.string().uuid(), note: z.string().trim().min(3).max(500) }))
    .mutation(async ({ input }) => resolveHeldWithdraw(input.withdrawId, input.note)),
});
