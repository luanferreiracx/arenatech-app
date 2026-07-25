/**
 * Tool de cliente — busca cadastro por telefone/CPF. Somente leitura.
 * Não expõe dados sensíveis ao modelo além do necessário pra personalizar
 * o atendimento (nome + se tem cadastro).
 */

import { z } from "zod";
import type { TalisonTool } from "@/lib/talison/tools/contract";

const buscarClienteSchema = z.object({
  cpf: z
    .string()
    .optional()
    .describe("CPF do cliente (só dígitos), se ele informar. Caso contrário usa o telefone do contato."),
});

export const buscarCliente: TalisonTool<typeof buscarClienteSchema> = {
  name: "buscar_cliente",
  description:
    "Busca o cadastro do cliente pelo telefone do contato (ou CPF, se informado). " +
    "Use pra saber se já é cliente e personalizar o atendimento pelo nome. " +
    "Não revele dados pessoais que o cliente não tenha fornecido.",
  schema: buscarClienteSchema,
  async execute(args, ctx) {
    return ctx.withTenant(async (tx) => {
      const last9 = ctx.conversation.contactPhone.slice(-9);
      // IDOR (auditoria 2026-07-25): com `cpf` presente, a busca IGNORAVA o
      // telefone do contato e casava qualquer CPF do tenant, devolvendo o nome
      // do titular — um oráculo CPF→nome por canal público, com o argumento
      // controlado pelo texto do cliente. O telefone do contato passa a ancorar
      // SEMPRE; o CPF é filtro adicional (AND), nunca chave alternativa.
      const customer = await tx.customer.findFirst({
        where: {
          tenantId: ctx.tenantId,
          OR: [
            { phone: { contains: last9 } },
            { phoneSecondary: { contains: last9 } },
          ],
          ...(args.cpf ? { cpf: args.cpf.replace(/\D/g, "") } : {}),
        },
        select: { id: true, name: true },
      });

      if (!customer) {
        return {
          ok: false as const,
          reason: "Contato ainda não tem cadastro. Trate como cliente novo.",
        };
      }

      return {
        ok: true as const,
        data: { cadastrado: true, nome: customer.name },
        display: `Cliente cadastrado: ${customer.name}.`,
      };
    });
  },
};
