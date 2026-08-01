/**
 * Vídeo no Talison — o quadro extraído entra na visão como qualquer imagem.
 *
 * Um terço dos stories do Instagram chega em vídeo e o modelo não assiste vídeo.
 * Extraímos um quadro e descrevemos. Quando o quadro não sai, o bot volta a
 * receber a nota que manda pedir descrição ou foto — nunca fica mudo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LlmMessage } from "@/lib/talison/types";

vi.mock("@/server/db", () => {
  const conversation = {
    id: "conv-1",
    tenantId: "tenant-1",
    status: "BOT_ACTIVE",
    contactPhone: "5586999998888",
    contactName: "João",
    customerId: null,
    externalId: "42",
  };
  const storedMessages = [
    {
      id: "msg-video-1",
      direction: "incoming",
      senderType: "customer",
      content: "ainda tem?",
      contentType: "video",
      mediaUrl: "https://x/story.mp4",
      metadata: null,
    },
  ];
  const tx = {
    chatbotConversation: {
      findFirst: vi.fn().mockResolvedValue(conversation),
      update: vi.fn().mockResolvedValue({}),
    },
    tenant: { findUnique: vi.fn().mockResolvedValue({ slug: "arena-tech" }) },
    chatbotConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    tenantSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    tenantAssistanceSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    chatbotMessage: {
      findMany: vi.fn().mockResolvedValue([...storedMessages].reverse()),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  return {
    withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
    withTenant: (_tenantId: string, fn: (t: typeof tx) => unknown) => fn(tx),
  };
});

const { describe_, runTalison, extractVideoFrame } = vi.hoisted(() => ({
  describe_: vi.fn().mockResolvedValue("iPhone 17 Pro Max 256GB azul, preço R$ 7.799"),
  runTalison: vi.fn().mockResolvedValue({
    reply: "Temos sim!",
    iterations: 1,
    toolsUsed: [],
    degraded: false,
  }),
  extractVideoFrame: vi.fn(),
}));

vi.mock("@/lib/talison/providers/claude-vision", () => ({
  createClaudeVisionProvider: () => ({ name: "claude-vision", describe: describe_ }),
}));
vi.mock("@/lib/talison/providers/video-frame", () => ({
  extractVideoFrame: (url: string) => extractVideoFrame(url),
}));
vi.mock("@/lib/talison/agent", () => ({ runTalison: (args: unknown) => runTalison(args) }));
vi.mock("@/lib/talison/providers/deepseek", () => ({
  createDeepSeekProvider: () => ({ name: "deepseek", chat: vi.fn() }),
}));
vi.mock("@/lib/talison/chatwoot-client", () => ({
  sendBotMessage: vi.fn().mockResolvedValue(true),
  toggleStatus: vi.fn().mockResolvedValue(true),
}));

import { processConversation } from "@/lib/talison/runner";

function userMessageOf(call: unknown): string {
  const args = call as { history: LlmMessage[] };
  return String(args.history.find((m) => m.role === "user")?.content ?? "");
}

describe("processConversation — vídeo", () => {
  beforeEach(() => {
    runTalison.mockClear();
    describe_.mockClear();
    extractVideoFrame.mockReset();
  });

  it("extrai o quadro e injeta a descrição no histórico do DeepSeek", async () => {
    const frame = { base64: "AAAA", mediaType: "image/jpeg" };
    extractVideoFrame.mockResolvedValue(frame);

    const result = await processConversation("tenant-1", "conv-1");

    expect(result.status).toBe("replied");
    expect(extractVideoFrame).toHaveBeenCalledWith("https://x/story.mp4");
    expect(describe_).toHaveBeenCalledWith({ image: frame });

    const content = userMessageOf(runTalison.mock.calls[0]?.[0]);
    expect(content).toContain("iPhone 17 Pro Max 256GB azul");
    expect(content).toContain("ainda tem?"); // legenda do cliente preservada
  });

  it("sem quadro, mantém a nota que manda pedir descrição ou foto", async () => {
    extractVideoFrame.mockResolvedValue(null);

    const result = await processConversation("tenant-1", "conv-1");

    expect(result.status).toBe("replied");
    expect(describe_).not.toHaveBeenCalled();

    const content = userMessageOf(runTalison.mock.calls[0]?.[0]);
    expect(content).toContain("você não consegue assistir vídeos");
    expect(content).toContain("ainda tem?");
  });

  it("falha na extração não derruba o atendimento", async () => {
    extractVideoFrame.mockRejectedValue(new Error("ffmpeg morreu"));

    const result = await processConversation("tenant-1", "conv-1");

    expect(result.status).toBe("replied");
    expect(userMessageOf(runTalison.mock.calls[0]?.[0])).toContain(
      "você não consegue assistir vídeos",
    );
  });
});
