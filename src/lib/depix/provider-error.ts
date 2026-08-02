/**
 * Traduz a recusa da Eulen para uma frase que o lojista consegue usar.
 *
 * Hoje o erro do provedor chega cru na tela, em inglês, colado a um prefixo
 * nosso. O que o lojista lê quando o saque falha é literalmente:
 *
 *   "Erro ao solicitar saque: After a compliance review, we are unable to
 *    process this withdrawal at this time. If you believe this decision was
 *    made in error, please contact our support team and provide the following
 *    reference number: 019fba96564c72b78aa1e414ff24442e"
 *
 * Isso é ruim por três motivos, e o terceiro é o que importa quando houver
 * clientes: (1) está em inglês; (2) não diz o que fazer; (3) manda contatar "our
 * support team", que é o suporte da EULEN — o lojista não tem conta lá, quem tem
 * é a Arena. Ele vai bater numa porta que não abre para ele.
 *
 * As mensagens ficam aqui, puras e testáveis, e não espalhadas em `if` no meio
 * do caminho do dinheiro.
 */

/**
 * Teto do texto que chega ao usuário.
 *
 * `sanitizeUserError`, no caminho do saque, TROCA por uma frase genérica
 * qualquer erro acima deste tamanho — a heurística que barra dump de stack e
 * detalhe interno. Uma tradução comprida demais seria descartada em silêncio e
 * o lojista veria "Falha ao iniciar saque no provedor PIX", ou seja, a tradução
 * inteira não teria servido para nada. Por isso o limite mora aqui, junto de
 * quem escreve as mensagens, e o sanitizador o importa.
 */
export const MAX_USER_FACING_ERROR_LENGTH = 200;

/** De quem é o problema — muda completamente o que o lojista deve fazer. */
export type ProviderErrorScope =
  /** Do saque em si: dá pra corrigir e tentar de novo. */
  | "withdrawal"
  /** Da CONTA da Arena no provedor: o lojista não tem como resolver. */
  | "arena_account"
  /** Não reconhecido: repassa o original sem inventar diagnóstico. */
  | "unknown";

export type TranslatedProviderError = {
  scope: ProviderErrorScope;
  message: string;
  /** Mensagem crua do provedor, para log/suporte. Nunca sumir com ela. */
  original: string;
};

const BRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * "Daily volume in cents: 500000. Withdrawal limit in cents: 600000."
 *
 * Usar os números do PRÓPRIO provedor evita o erro de reimplementar a regra dele
 * e errar: o limite é por CHAVE PIX de destino, não por conta nem por tenant, e
 * descobrimos isso lendo esta frase — não a documentação, que não publica limite
 * nenhum.
 */
const DAILY_LIMIT = /daily withdrawal limit exceeded for pix key '([^']+)'\.\s*daily volume in cents:\s*(\d+)\.\s*withdrawal limit in cents:\s*(\d+)/i;

/** Referência que o suporte da Eulen pede. Sem ela o chamado não anda. */
const REFERENCE = /reference number:\s*([0-9a-f]{16,})/i;

export function translateProviderWithdrawError(raw: string): TranslatedProviderError {
  const original = raw.trim();
  const lower = original.toLowerCase();

  const limit = DAILY_LIMIT.exec(original);
  if (limit) {
    const [, pixKey, usedRaw, capRaw] = limit;
    const used = Number(usedRaw);
    const cap = Number(capRaw);
    const remaining = Math.max(0, cap - used);
    return {
      scope: "withdrawal",
      original,
      message:
        `Esta chave PIX já recebeu ${BRL(used)} hoje e o provedor limita ${BRL(cap)} por dia por chave. ` +
        (remaining > 0
          ? `Ainda cabem ${BRL(remaining)}: reduza o valor, use outra chave ou tente amanhã.`
          : `O limite dela acabou: use outra chave ou tente amanhã.`),
    };
  }

  if (lower.includes("after a compliance review")) {
    const reference = REFERENCE.exec(original)?.[1];
    return {
      scope: "arena_account",
      original,
      message:
        "Provedor recusou por checagem de conformidade na conta da Arena Tech, não na sua loja. " +
        "Repetir não resolve: acione o suporte da Arena" +
        (reference ? ` com a referência ${reference}.` : "."),
    };
  }

  if (lower.includes("withdraw blocked") && lower.includes("pending fees")) {
    return {
      scope: "arena_account",
      original,
      message:
        "Saques bloqueados no provedor por pendência financeira da conta da Arena Tech. " +
        "Não é do seu cadastro e repetir não resolve: avise o suporte da Arena.",
    };
  }

  // Nada de adivinhar. Uma mensagem desconhecida repassada inteira é pior que
  // uma tradução errada só na aparência — a errada manda o lojista fazer a coisa
  // errada com confiança.
  return { scope: "unknown", original, message: original };
}
