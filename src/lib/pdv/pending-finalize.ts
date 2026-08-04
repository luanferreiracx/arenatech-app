/**
 * Pagamento que o cliente JÁ FEZ e cuja venda ainda não foi registrada.
 *
 * Existe porque a confirmação do pagamento vivia só no `useState` do
 * `payment-dialog`: uma queda de rede no meio do finalize automático apagava a
 * prova de que o dinheiro entrou. O operador via um toast que sumia em
 * segundos e, sob pressão, refazia a cobrança — cobrando o cliente duas vezes.
 *
 * É a mesma classe do incidente de saque duplicado: o timeout comeu a resposta,
 * o app gravou o estado pessimista, e quem pagou a conta foi o cliente.
 *
 * Fica em `sessionStorage` (não `localStorage`) de propósito: a pendência é da
 * SESSÃO de trabalho. Fechar o navegador encerra o expediente; carregar isso
 * para o dia seguinte só geraria um aviso órfão que ninguém sabe resolver.
 *
 * Auditoria de frontend 2026-08-04, P0-1.
 */

export interface PendingFinalize {
  saleId: string;
  amountCents: number;
  /** "DePix" / "InfinitePay" — como o cliente pagou. */
  label: string;
  /** Mensagem do erro que impediu o registro, para o operador relatar. */
  message: string;
}

export const PENDING_FINALIZE_KEY = "pdv:pending-finalize";

/** Grava (ou limpa, com `null`) a pendência da sessão. */
export function persistPendingFinalize(pending: PendingFinalize | null): void {
  try {
    if (pending) {
      sessionStorage.setItem(PENDING_FINALIZE_KEY, JSON.stringify(pending));
    } else {
      sessionStorage.removeItem(PENDING_FINALIZE_KEY);
    }
  } catch {
    // sessionStorage indisponível (modo privado, quota estourada). O estado em
    // memória ainda protege a sessão atual — derrubar a venda em curso por
    // causa disso seria pior que perder a persistência.
  }
}

/**
 * Lê a pendência da sessão, mas SÓ se for desta venda.
 *
 * O escopo por venda evita o pior efeito colateral possível: abrir uma venda
 * nova e ver um aviso de "dinheiro já recebido" que pertence à anterior.
 */
export function readPendingFinalize(saleId: string): PendingFinalize | null {
  try {
    const raw = sessionStorage.getItem(PENDING_FINALIZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingFinalize;
    return parsed.saleId === saleId ? parsed : null;
  } catch {
    // JSON corrompido ou storage bloqueado: tratar como "sem pendência" é
    // seguro — o pior caso volta a ser o comportamento antigo, não um crash.
    return null;
  }
}
