/**
 * Tool de avaliação de aparelho (trade-in) — somente leitura.
 * Consulta a tabela device_valuations (valores migrados do Laravel).
 * O valor é o oficial pra aquele modelo/armazenamento/saúde de bateria.
 */

import { z } from "zod";
import { formatBRL, type TalisonTool } from "@/lib/talison/tools/contract";

const consultarAvaliacaoSchema = z.object({
  modelo: z.string().describe("Modelo do aparelho — ex: 'iPhone 13 Pro'."),
  armazenamento: z
    .string()
    .optional()
    .describe("Capacidade — ex: '128GB'. Refina o valor."),
  saude_bateria: z
    .string()
    .optional()
    .describe("Saúde da bateria informada pelo cliente — ex: '89%'."),
});

export const consultarAvaliacao: TalisonTool<typeof consultarAvaliacaoSchema> = {
  name: "consultar_avaliacao",
  description:
    "Consulta o valor de avaliação (quanto a Arena Tech paga / aceita na troca) de " +
    "um aparelho usado. Use quando o cliente quiser vender ou trocar o aparelho. " +
    "O valor é o oficial cadastrado — copie exatamente. Sem cadastro, transfira pra um atendente avaliar.",
  schema: consultarAvaliacaoSchema,
  async execute(args, ctx) {
    return ctx.withTenant(async (tx) => {
      const valuation = await tx.deviceValuation.findFirst({
        where: {
          tenantId: ctx.tenantId,
          deletedAt: null,
          modelo: { contains: args.modelo.trim(), mode: "insensitive" },
          ...(args.armazenamento
            ? { armazenamento: { contains: args.armazenamento.trim(), mode: "insensitive" } }
            : {}),
          ...(args.saude_bateria
            ? { saudeBateria: { contains: args.saude_bateria.trim() } }
            : {}),
        },
        orderBy: { valor: "desc" },
        select: { modelo: true, armazenamento: true, saudeBateria: true, valor: true, validadeDias: true },
      });

      if (!valuation) {
        return {
          ok: false as const,
          reason: `Não há avaliação cadastrada para "${args.modelo}"${args.armazenamento ? ` ${args.armazenamento}` : ""}. Transfira pra um atendente avaliar o aparelho.`,
        };
      }

      return {
        ok: true as const,
        data: {
          modelo: valuation.modelo,
          armazenamento: valuation.armazenamento,
          valor: formatBRL(valuation.valor.toString()),
          validade_dias: valuation.validadeDias,
        },
        display:
          `${valuation.modelo} ${valuation.armazenamento} (bateria ${valuation.saudeBateria}): ` +
          `${formatBRL(valuation.valor.toString())}. Valor válido por ${valuation.validadeDias} dias.`,
      };
    });
  },
};
