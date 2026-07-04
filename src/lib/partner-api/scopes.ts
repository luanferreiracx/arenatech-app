/**
 * Escopos da API de parceiros (ADR 0057). Cada API-key concede um subconjunto.
 * Endpoints de escrita que movem dinheiro exigem o escopo correspondente
 * explicitamente (default desligado).
 */
export const PARTNER_SCOPES = {
  /** Criar depósito (gerar QR PIX). */
  DEPIX_DEPOSIT: "depix:deposit",
  /** Sacar (PIX/on-chain) — sensível, opt-in por key. */
  DEPIX_WITHDRAW: "depix:withdraw",
} as const;

export type PartnerScope = (typeof PARTNER_SCOPES)[keyof typeof PARTNER_SCOPES];

export const ALL_PARTNER_SCOPES: PartnerScope[] = Object.values(PARTNER_SCOPES);

/**
 * Escopos que autorizam consultar o STATUS de uma transação (`GET /transactions/:id`):
 * quem pode criar depósito/saque pode acompanhar o desfecho. Não há mais escopo de
 * leitura dedicado — a API se limita a depósito + saque (+ status do que foi criado).
 */
export const TRANSACTION_READ_SCOPES: PartnerScope[] = [
  PARTNER_SCOPES.DEPIX_DEPOSIT,
  PARTNER_SCOPES.DEPIX_WITHDRAW,
];

export function isValidScope(s: string): s is PartnerScope {
  return (ALL_PARTNER_SCOPES as string[]).includes(s);
}

/** Rótulos PT-BR para a UI. */
export const PARTNER_SCOPE_LABELS: Record<PartnerScope, string> = {
  "depix:deposit": "DePix — criar depósito (gerar QR)",
  "depix:withdraw": "DePix — sacar via PIX (off-ramp Eulen)",
};
