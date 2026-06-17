/**
 * Visão — download server-side da imagem.
 *
 * Regressão (varredura jun/26): o Claude não seguia o redirect do active_storage
 * do Chatwoot (story do Instagram) e ficava cego. Agora baixamos a imagem nós
 * mesmos e mandamos base64; se o download falhar, cai pra URL (degradação).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createClaudeVisionProvider } from "@/lib/talison/providers/claude-vision";

const realFetch = global.fetch;

function mockImageResponse(bytes: Uint8Array, contentType = "image/jpeg") {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

describe("claude-vision — download server-side", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    create.mockReset();
    create.mockResolvedValue({ content: [{ type: "text", text: "MacBook Air M4 256GB na mesa" }] });
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("baixa a imagem e manda base64 (media_type do content-type) pro Claude", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    global.fetch = vi.fn().mockResolvedValue(mockImageResponse(bytes, "image/png")) as typeof fetch;

    const provider = createClaudeVisionProvider();
    const out = await provider.describe({ imageUrl: "https://chatwoot/story.jpg" });

    expect(out).toContain("MacBook Air M4");
    const source = (create.mock.calls[0]?.[0]?.messages?.[0]?.content?.[0]?.source) as {
      type: string;
      media_type?: string;
      data?: string;
    };
    expect(source.type).toBe("base64");
    expect(source.media_type).toBe("image/png");
    expect(source.data).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("cai pra URL quando o download falha (degradação, nunca pior que hoje)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network")) as typeof fetch;

    const provider = createClaudeVisionProvider();
    await provider.describe({ imageUrl: "https://chatwoot/story.jpg" });

    const source = create.mock.calls[0]?.[0]?.messages?.[0]?.content?.[0]?.source as { type: string; url?: string };
    expect(source.type).toBe("url");
    expect(source.url).toBe("https://chatwoot/story.jpg");
  });

  it("content-type não suportado vira image/jpeg", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockImageResponse(new Uint8Array([9]), "application/octet-stream")) as typeof fetch;

    const provider = createClaudeVisionProvider();
    await provider.describe({ imageUrl: "https://chatwoot/story" });

    const source = create.mock.calls[0]?.[0]?.messages?.[0]?.content?.[0]?.source as { media_type?: string };
    expect(source.media_type).toBe("image/jpeg");
  });
});
