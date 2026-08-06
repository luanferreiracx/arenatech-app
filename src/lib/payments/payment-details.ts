/**
 * Fonte única para ler `sales.payment_details`.
 *
 * O campo carrega **três formas** em produção, todas vivas no mesmo banco:
 *
 * | forma                    | vendas | período            | `amount` |
 * |--------------------------|--------|--------------------|----------|
 * | array nativo             | 1.247  | 14/02 → hoje       | centavos |
 * | string JSON escapada     | 257    | 10/04 (migração)   | reais    |
 * | `NULL`                   | 1.050  | 12/02 → 10/04      | —        |
 *
 * A forma string veio da migração do Laravel: o JSON foi gravado como *texto*
 * dentro do JSONB, com as chaves em português (`forma`, `valor`) e o valor em
 * reais, não em centavos.
 *
 * Quem lia com `as Array<...>` — uma promessa ao compilador que o dado não
 * cumpre — quebrava de dois jeitos diferentes, medidos no navegador
 * (auditoria 2026-08-06, M8-1):
 *
 * - `.map()` numa string → `TypeError`, e a tela de detalhe da venda mostrava
 *   "Algo deu errado nesta tela". **257 vendas, R$ 1.383.288.**
 * - `for...of` numa string **não lança**: itera caractere a caractere. O recibo
 *   saía com HTTP 200 e **76 linhas de pagamento com `NaN`** — num documento
 *   que vai para o cliente.
 *
 * Normalizar na leitura, e não migrar o dado, é deliberado: o histórico fica
 * fiel ao que foi gravado, e qualquer leitor novo herda o tratamento das três
 * formas de graça.
 */

/** Uma perna de pagamento, já normalizada. `amount` sempre em CENTAVOS. */
export type PaymentLeg = {
  method: string;
  methodLabel?: string;
  amount: number;
  installments: number;
};

/** Forma legada do Laravel: chaves em português, valor em reais. */
type LegacyLeg = { forma?: unknown; valor?: unknown };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeLeg(raw: unknown): PaymentLeg | null {
  if (!isRecord(raw)) return null;

  // Forma legada: `valor` em REAIS vira centavos. `Math.round` porque
  // 4582.13 * 100 é 458212.99999999994 em ponto flutuante.
  const legacy = raw as LegacyLeg;
  if (typeof legacy.forma === "string" && typeof legacy.valor === "number") {
    return {
      method: legacy.forma,
      amount: Math.round(legacy.valor * 100),
      installments: 1,
    };
  }

  if (typeof raw.method !== "string" || typeof raw.amount !== "number") return null;

  return {
    method: raw.method,
    methodLabel: typeof raw.methodLabel === "string" ? raw.methodLabel : undefined,
    amount: raw.amount,
    installments: typeof raw.installments === "number" ? raw.installments : 1,
  };
}

/**
 * Lê `payment_details` em qualquer uma das três formas e devolve as pernas
 * normalizadas, sempre em centavos. Nunca lança: dado que não casa com nenhuma
 * forma conhecida vira lista vazia — a tela mostra "-", que é honesto, em vez
 * de quebrar ou imprimir `NaN`.
 */
export function parsePaymentDetails(raw: unknown): PaymentLeg[] {
  if (raw == null) return [];

  // Forma legada: JSON gravado como TEXTO dentro do JSONB.
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeLeg).filter((l) => l !== null) : [];
    } catch {
      return [];
    }
  }

  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeLeg).filter((l) => l !== null);
}
