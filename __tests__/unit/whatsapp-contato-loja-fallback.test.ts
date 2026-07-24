/**
 * Regressão A4 — mensagem avulsa da loja (módulo Comunicação) usa o fallback de
 * janela 24h, não texto cru.
 *
 * Bug: `communication.dispatchMessage` mandava `sendTextMessage` (texto cru), que
 * a Meta só entrega DENTRO da janela de 24h. Um contato frio (o caso comum de
 * outreach avulso) era rejeitado e virava FAILED sem explicação. O fix roteia
 * pelo `sendTextWithFallback` com o contexto `contato_loja` → fora da janela cai
 * no template aprovado `padrao`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendCloudText = vi.fn();
const sendCloudTemplate = vi.fn();
vi.mock("@/lib/services/whatsapp-cloud-service", () => ({
  sendCloudText: (...args: unknown[]) => sendCloudText(...args),
  sendCloudTemplate: (...args: unknown[]) => sendCloudTemplate(...args),
  formatBrPhone: (p: string) => p,
}));

const isWithin24hWindow = vi.fn();
vi.mock("@/lib/whatsapp/conversation-window", () => ({
  isWithin24hWindow: (...args: unknown[]) => isWithin24hWindow(...args),
}));

import { sendTextWithFallback } from "@/lib/whatsapp/send-with-fallback";
import { TEMPLATE_CONTEXTS, APPROVED_TEMPLATES } from "@/lib/whatsapp/templates-catalog";

describe("A4 — contexto contato_loja (mensagem avulsa da loja)", () => {
  beforeEach(() => {
    sendCloudText.mockReset();
    sendCloudTemplate.mockReset();
    isWithin24hWindow.mockReset();
  });

  it("mapeia contato_loja para o template padrao", () => {
    expect(TEMPLATE_CONTEXTS.contato_loja).toBe("padrao");
    expect(APPROVED_TEMPLATES.padrao).toBeDefined();
  });

  it("FORA da janela: envia o template padrao (nunca o texto cru)", async () => {
    isWithin24hWindow.mockResolvedValue(false);
    sendCloudTemplate.mockResolvedValue({ success: true, messageId: "wamid.tpl" });

    const res = await sendTextWithFallback({
      phone: "11999998888",
      freeText: "Olá! Chegou seu acessório reservado.",
      contexto: "contato_loja",
      params: ["João", "seu atendimento"],
    });

    expect(res.success).toBe(true);
    expect(res.via).toBe("template");
    expect(res.templateUsed).toBe("padrao");
    // O ponto do bug: texto cru NÃO pode ser tentado fora da janela.
    expect(sendCloudText).not.toHaveBeenCalled();
    expect(sendCloudTemplate).toHaveBeenCalledTimes(1);
    const [, templateName] = sendCloudTemplate.mock.calls[0]!;
    expect(templateName).toBe("padrao");
  });

  it("DENTRO da janela: envia o texto livre digitado pelo operador", async () => {
    isWithin24hWindow.mockResolvedValue(true);
    sendCloudText.mockResolvedValue({ success: true, messageId: "wamid.txt" });

    const res = await sendTextWithFallback({
      phone: "11999998888",
      freeText: "Olá! Chegou seu acessório reservado.",
      contexto: "contato_loja",
      params: ["João", "seu atendimento"],
    });

    expect(res.success).toBe(true);
    expect(res.via).toBe("text");
    expect(sendCloudText).toHaveBeenCalledTimes(1);
    const [, text] = sendCloudText.mock.calls[0]!;
    expect(text).toBe("Olá! Chegou seu acessório reservado.");
    expect(sendCloudTemplate).not.toHaveBeenCalled();
  });
});
