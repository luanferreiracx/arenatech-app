const RECEIPT_URL_KEYS = [
  "receipt_url",
  "receiptUrl",
  "transfer_receipt_url",
  "transferReceiptUrl",
  "transaction_receipt_url",
  "transactionReceiptUrl",
  "proof_url",
  "proofUrl",
  "comprovante_url",
  "comprovanteUrl",
  "receipt_link",
  "receiptLink",
  "url_comprovante",
  "urlComprovante",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Extrai a URL de comprovante enviada pela PixPay em payloads de saque.
 *
 * A PixPay ja usou formatos diferentes em respostas/webhooks (`response`,
 * array com `{ response }` e objeto raiz). Mantemos busca permissiva por
 * aliases comuns para nao amarrar o app a um nome especifico do provedor.
 */
export function extractDepixWithdrawReceiptUrl(payload: unknown): string | null {
  const stack: unknown[] = [payload];
  const seen = new Set<unknown>();

  while (stack.length > 0) {
    const current = stack.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }

    if (!isRecord(current)) continue;

    for (const key of RECEIPT_URL_KEYS) {
      const value = current[key];
      if (isHttpUrl(value)) return value;
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value) || isRecord(value)) stack.push(value);
    }
  }

  return null;
}
