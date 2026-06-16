/**
 * Tools de avaliação de aparelho (trade-in) — fluxo de DUAS etapas, fiel ao
 * Laravel (ChatbotController::toolIniciarAvaliacao / toolCalcularAvaliacao):
 *
 *  1. iniciar_avaliacao(categoria) → envia o QUESTIONÁRIO com TODOS os campos
 *     necessários + disclaimer (estimativa, presencial, validade 1 dia).
 *  2. calcular_avaliacao(...campos) → só DEPOIS que o cliente responder, aplica
 *     bloqueadores/ajustes e busca o valor de tabela (device_valuations).
 *
 * O objetivo é o bot NUNCA deduzir condição (bateria, caixa, marcas): ele coleta
 * tudo e só então avalia. Valores só vêm da tabela; descontos seguem regras fixas.
 */

import { z } from "zod";
import { formatBRL, type TalisonTool } from "@/lib/talison/tools/contract";

const VALUATION_CATEGORIES = ["iphone", "ipad", "macbook", "apple_watch", "console"] as const;
type ValuationCategory = (typeof VALUATION_CATEGORIES)[number];

/** Faixa "-" para categorias cujo valor não depende de bateria (console/macbook). */
const NO_BATTERY_BAND = "-";

const DISCLAIMER =
  "⚠️ _Esta avaliação é apenas uma ESTIMATIVA, deve ser confirmada PRESENCIALMENTE e tem validade de APENAS 1 DIA._";

/** Questionário por categoria (campos obrigatórios pra avaliar). Fiel ao Laravel. */
const QUESTIONNAIRE: Record<ValuationCategory, string> = {
  iphone:
    "Para *pré-avaliar* seu aparelho, me informa:\n\n" +
    "• Modelo (ex: iPhone 13 Pro Max)\n" +
    "• Armazenamento (64GB, 128GB, 256GB...)\n" +
    "• Saúde da bateria (em %)\n" +
    "• Tem caixa original?\n" +
    "• Possui marcas de uso? (riscos, amassados)\n" +
    "• Está na garantia?\n" +
    "• Tudo funciona perfeitamente? (tela, botões, câmeras, biometria)\n" +
    "• Possui alguma peça substituída?\n" +
    "• Está desbloqueado de iCloud/conta? (sem bloqueio)\n\n" +
    `_Se tiver marcas de uso, vou pedir as fotos._\n\n${DISCLAIMER}`,
  ipad:
    "Para *pré-avaliar* seu iPad, me informa:\n\n" +
    "• Modelo\n• Tamanho da tela\n• Armazenamento\n• Tem caixa?\n" +
    "• Possui marcas de uso?\n• Está na garantia?\n• Tudo funciona perfeitamente?\n" +
    "• Possui alguma peça substituída?\n• Está desbloqueado de iCloud/conta?\n\n" +
    "_Se tiver marcas de uso, vou pedir as fotos._\n" +
    "_Sem caixa, é necessário documento de origem válido — nesse caso conecto com um atendente._\n\n" +
    DISCLAIMER,
  macbook:
    "Para *pré-avaliar* seu MacBook, me informa:\n\n" +
    "• Modelo (Air ou Pro)\n• Tamanho da tela\n• Processador (M1, M2, M3, M4...)\n" +
    "• Memória RAM\n• Armazenamento\n• Ciclos e saúde da bateria\n• Tem caixa?\n" +
    "• Possui marcas de uso?\n• Está na garantia?\n• Tudo funciona perfeitamente?\n" +
    "• Possui alguma peça substituída?\n• Está desbloqueado de iCloud/conta?\n\n" +
    "_Se tiver marcas de uso, vou pedir as fotos._\n" +
    "_Sem caixa, é necessário documento de origem válido — nesse caso conecto com um atendente._\n\n" +
    DISCLAIMER,
  apple_watch:
    "Para *pré-avaliar* seu Apple Watch, me informa:\n\n" +
    "• Modelo (ex: Series 9, Ultra 2, SE)\n• Tamanho (em MM)\n• Já foi aberto/consertado?\n" +
    "• Saúde da bateria\n• Tem caixa?\n• Possui marcas de uso?\n• Está na garantia?\n" +
    "• Está desbloqueado de iCloud/conta?\n\n" +
    "_Se tiver marcas de uso, vou pedir as fotos._\n" +
    "_Sem caixa, é necessário documento de origem válido — nesse caso conecto com um atendente._\n\n" +
    DISCLAIMER,
  console:
    "Para *pré-avaliar* seu console, me informa:\n\n" +
    "• Modelo completo (geração e versão, se aplicável)\n• Armazenamento\n• Tem caixa?\n" +
    "• Controles originais? Quantos?\n• Cabos originais (HDMI e força)?\n" +
    "• Possui marcas de uso?\n• Está na garantia?\n• Tudo funciona perfeitamente?\n\n" +
    `_Se tiver marcas de uso, vou pedir as fotos._\n\n${DISCLAIMER}`,
};

const iniciarAvaliacaoSchema = z.object({
  categoria: z
    .enum(VALUATION_CATEGORIES)
    .describe("Tipo do aparelho que o cliente quer trocar/vender."),
});

export const iniciarAvaliacao: TalisonTool<typeof iniciarAvaliacaoSchema> = {
  name: "iniciar_avaliacao",
  description:
    "ETAPA 1 da avaliação de troca/venda de aparelho usado. Use ASSIM QUE o cliente " +
    "demonstrar que quer trocar, vender ou dar um aparelho como entrada — antes de qualquer " +
    "valor. Retorna o questionário com TODOS os dados necessários pra avaliar; entregue-o ao " +
    "cliente e aguarde ele responder. NÃO deduza nenhuma condição (bateria, caixa, marcas).",
  schema: iniciarAvaliacaoSchema,
  async execute(args) {
    return {
      ok: true as const,
      data: { categoria: args.categoria },
      display: QUESTIONNAIRE[args.categoria],
    };
  },
};

/** Mapeia a saúde da bateria informada (%) na faixa da tabela. Fiel ao Laravel. */
function mapearBateriaFaixa(percent: number | undefined, categoria: ValuationCategory): string {
  // Console/MacBook não variam por bateria na tabela (faixa "-").
  if (categoria === "console" || categoria === "macbook") return NO_BATTERY_BAND;
  if (percent === undefined) return NO_BATTERY_BAND;
  if (percent < 80) return "< 80%";
  if (percent < 85) return "80% - 85%";
  if (percent <= 90) return "85% - 90%";
  return "> 90%";
}

const NO_BOX_DISCOUNT_RATE = 0.1;
const LIGHT_MARKS_DISCOUNT = 100;

const calcularAvaliacaoSchema = z.object({
  categoria: z.enum(VALUATION_CATEGORIES).describe("Tipo do aparelho."),
  modelo: z.string().describe("Modelo do aparelho — ex: 'iPhone 13 Pro Max'."),
  armazenamento: z.string().optional().describe("Capacidade — ex: '128GB'. Refina o valor."),
  saude_bateria_percent: z
    .number()
    .optional()
    .describe("Saúde da bateria em % que o cliente INFORMOU (ex: 89). Não invente."),
  tem_caixa: z.boolean().optional().describe("O cliente informou que tem a caixa original?"),
  marcas_uso: z
    .enum(["nenhuma", "leves", "medias", "fortes"])
    .optional()
    .describe("Nível de marcas de uso conforme o cliente descreveu. Default 'nenhuma'."),
  tudo_funciona: z
    .boolean()
    .optional()
    .describe("O cliente confirmou que tudo funciona (tela, botões, câmeras, biometria)?"),
  peca_substituida: z.boolean().optional().describe("Tem alguma peça já substituída/trocada?"),
  bloqueado_icloud: z
    .boolean()
    .optional()
    .describe("Está bloqueado por iCloud/conta? Se sim, não recebemos."),
});

export const calcularAvaliacao: TalisonTool<typeof calcularAvaliacaoSchema> = {
  name: "calcular_avaliacao",
  description:
    "ETAPA 2 da avaliação de troca. Use SOMENTE depois que o cliente responder os dados do " +
    "questionário (iniciar_avaliacao). NUNCA invente nem deduza bateria/caixa/marcas — se algum " +
    "dado faltar, pergunte antes em vez de chamar esta tool. O valor sai da tabela oficial; " +
    "descontos por sem-caixa e marcas leves são aplicados pela tool. Copie o resultado exatamente.",
  schema: calcularAvaliacaoSchema,
  async execute(args, ctx) {
    const marcas = args.marcas_uso ?? "nenhuma";

    // 1. iCloud/conta bloqueada → NEGAR o recebimento (decisão do dono).
    if (args.bloqueado_icloud) {
      return {
        ok: false as const,
        reason:
          "Aparelho bloqueado por iCloud/conta NÃO é aceito. Diga com educação que infelizmente " +
          "não recebemos aparelho bloqueado e encerre — NÃO transfira nem convide à loja.",
      };
    }

    // 2. Bloqueadores duros → atendente avalia (com fotos).
    if (args.peca_substituida || args.tudo_funciona === false || marcas === "medias" || marcas === "fortes") {
      return {
        ok: false as const,
        reason:
          "Aparelho com restrição (peça substituída, problema funcional ou marcas médias/fortes) " +
          "precisa de avaliação humana. Transfira pra um atendente avaliar (ele pode pedir fotos) — " +
          "não dê valor automático.",
      };
    }

    // 3. Sem caixa em iPad/Mac/Watch → precisa documento de origem → atendente.
    const semCaixa = args.tem_caixa === false;
    if (semCaixa && (args.categoria === "ipad" || args.categoria === "macbook" || args.categoria === "apple_watch")) {
      return {
        ok: false as const,
        reason:
          "iPad/MacBook/Apple Watch sem caixa exige documento de origem — transfira pra um atendente " +
          "tratar presencialmente; não dê valor por aqui.",
      };
    }

    // 4. Faixa de bateria + 5. busca na tabela.
    const faixa = mapearBateriaFaixa(args.saude_bateria_percent, args.categoria);
    return ctx.withTenant(async (tx) => {
      const valuation = await tx.deviceValuation.findFirst({
        where: {
          tenantId: ctx.tenantId,
          deletedAt: null,
          modelo: { contains: args.modelo.trim(), mode: "insensitive" },
          ...(args.armazenamento
            ? { armazenamento: { contains: args.armazenamento.trim(), mode: "insensitive" } }
            : {}),
          ...(faixa !== NO_BATTERY_BAND ? { saudeBateria: faixa } : {}),
        },
        orderBy: { valor: "desc" },
        select: { modelo: true, armazenamento: true, saudeBateria: true, valor: true, validadeDias: true },
      });

      if (!valuation) {
        return {
          ok: false as const,
          reason:
            `Não há avaliação cadastrada para "${args.modelo}"${args.armazenamento ? ` ${args.armazenamento}` : ""}` +
            `${faixa !== NO_BATTERY_BAND ? ` (bateria ${faixa})` : ""}. NÃO convide o cliente à loja: ` +
            "transfira pra um atendente humano confirmar se aceitamos e qual o valor.",
        };
      }

      // 6. Ajustes (fiel ao Laravel).
      const valorBase = Number(valuation.valor);
      let valor = valorBase;
      const ajustes: string[] = [];

      if (semCaixa && (args.categoria === "iphone" || args.categoria === "console")) {
        const desconto = Math.round(valorBase * NO_BOX_DISCOUNT_RATE * 100) / 100;
        valor -= desconto;
        ajustes.push(`- Sem caixa: -10% (-${formatBRL(desconto)})`);
      }
      if (marcas === "leves") {
        valor -= LIGHT_MARKS_DISCOUNT;
        ajustes.push(`- Marcas de uso leves: -${formatBRL(LIGHT_MARKS_DISCOUNT)}`);
      }
      valor = Math.max(0, Math.round(valor * 100) / 100);

      const lines = [
        "💰 *Pré-avaliação do seu aparelho*",
        "",
        `📱 *${valuation.modelo}*${valuation.armazenamento ? ` — ${valuation.armazenamento}` : ""}`,
        ...(faixa !== NO_BATTERY_BAND ? [`🔋 Bateria: ${faixa}`] : []),
        "",
        `Valor de tabela: *${formatBRL(valorBase)}*`,
        ...ajustes,
        "",
        `💚 *Valor estimado pelo seu aparelho:* *${formatBRL(valor)}*`,
        "",
        `⚠️ _Estimativa — valor final confirmado presencialmente, validade de ${valuation.validadeDias} dia(s)._`,
      ];

      return {
        ok: true as const,
        data: {
          modelo: valuation.modelo,
          armazenamento: valuation.armazenamento,
          valor_base: formatBRL(valorBase),
          valor_final: formatBRL(valor),
          validade_dias: valuation.validadeDias,
        },
        display: lines.join("\n"),
      };
    });
  },
};
