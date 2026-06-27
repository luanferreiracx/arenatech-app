import { sendGroupMessage } from "@/lib/services/whatsapp-service";
import { logger } from "@/lib/logger";

/**
 * Notifica o grupo "Confirmações Depix" (WhatsApp via Evolution) a cada webhook
 * da Eulen recebido — deposit, withdraw, med e QR estatico. Best-effort: nunca
 * quebra o processamento do webhook (try/catch + fire-and-forget no caller).
 *
 * JID/instancia configuraveis por env, com default nos valores de producao.
 */
const GROUP_JID = process.env.DEPIX_CONFIRM_GROUP_JID ?? "120363426642699479@g.us";
const INSTANCE = process.env.DEPIX_CONFIRM_INSTANCE ?? "arena-cripto";

function brl(cents: number | undefined | null): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Linha "🔸 Rotulo: valor" só quando o valor existe. */
function line(label: string, value: unknown): string | null {
  if (value == null || value === "") return null;
  return `🔸 *${label}:* ${String(value)}`;
}

/**
 * Monta e envia a mensagem do webhook ao grupo. `kind` = deposit/withdraw/med/
 * static. `data` = campos relevantes ja extraidos pelo handler.
 */
export async function notifyDepixWebhook(args: {
  kind: "deposit" | "withdraw" | "med" | "static";
  status?: string | null;
  valueInCents?: number | null;
  payerName?: string | null;
  payerTaxNumber?: string | null;
  pixKey?: string | null;
  qrId?: string | null;
  withdrawalId?: string | null;
  blockchainTxID?: string | null;
  bankTxId?: string | null;
  extra?: Record<string, unknown>;
}): Promise<void> {
  const title = {
    deposit: "📥 *Depósito DePix*",
    withdraw: "📤 *Saque DePix*",
    med: "⚠️ *Devolução (MED)*",
    static: "🟢 *Pagamento QR estático*",
  }[args.kind];

  const lines = [
    title,
    line("Status", args.status),
    line("Valor", args.valueInCents != null ? brl(args.valueInCents) : null),
    line("Pagador", args.payerName),
    line("CPF/CNPJ", args.payerTaxNumber),
    line("Chave PIX", args.pixKey),
    line("qrId", args.qrId),
    line("Saque", args.withdrawalId),
    line("TxID on-chain", args.blockchainTxID),
    line("bankTxId", args.bankTxId),
    ...Object.entries(args.extra ?? {}).map(([k, v]) => line(k, v)),
  ].filter((l): l is string => l !== null);

  const text = lines.join("\n");

  try {
    await sendGroupMessage(GROUP_JID, text, { instanceName: INSTANCE });
  } catch (err) {
    logger.warn("notifyDepixWebhook: falha ao enviar ao grupo", {
      kind: args.kind,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
