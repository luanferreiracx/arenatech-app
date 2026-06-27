/**
 * notifyDepixWebhook: monta a mensagem com os dados do webhook e envia ao grupo
 * "Confirmacoes Depix" via Evolution (sendGroupMessage). Best-effort.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendGroupMessage = vi.fn();
vi.mock("@/lib/services/whatsapp-service", () => ({
  sendGroupMessage: (...a: unknown[]) => sendGroupMessage(...a),
}));

import { notifyDepixWebhook } from "@/lib/webhooks/eulen-webhook-notify";

beforeEach(() => {
  sendGroupMessage.mockReset();
  sendGroupMessage.mockResolvedValue({ success: true });
});

describe("notifyDepixWebhook", () => {
  it("QR estatico: inclui titulo, valor formatado, pagador e txid", async () => {
    await notifyDepixWebhook({
      kind: "static",
      status: "depix_sent",
      valueInCents: 2000,
      payerName: "PAULO DE MEDEIROS",
      payerTaxNumber: "***.170.868-**",
      blockchainTxID: "c379e379",
    });
    expect(sendGroupMessage).toHaveBeenCalledTimes(1);
    const [jid, text, opts] = sendGroupMessage.mock.calls[0]!;
    expect(String(jid)).toContain("@g.us");
    expect(opts).toMatchObject({ instanceName: "arena-cripto" });
    expect(text).toContain("QR estático");
    expect(text).toContain("R$ 20,00"); // 2000 centavos formatado pt-BR
    expect(text).toContain("PAULO DE MEDEIROS");
    expect(text).toContain("c379e379");
  });

  it("omite linhas de campos ausentes", async () => {
    await notifyDepixWebhook({ kind: "deposit", status: "approved", valueInCents: 5000 });
    const text = sendGroupMessage.mock.calls[0]![1] as string;
    expect(text).not.toContain("Pagador");
    expect(text).toContain("Depósito");
  });

  it("falha do envio nao propaga (best-effort)", async () => {
    sendGroupMessage.mockRejectedValue(new Error("evolution down"));
    await expect(notifyDepixWebhook({ kind: "withdraw", status: "sent" })).resolves.toBeUndefined();
  });
});
