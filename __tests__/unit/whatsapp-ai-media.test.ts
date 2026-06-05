import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateWhatsappAiImage, validateWhatsappAiImages } from "@/lib/whatsapp-ai-agent/media";

const originalEnv = process.env;
const imageBytes = new Uint8Array([1, 2, 3]);

function mockImageFetch(contentType = "image/jpeg", bytes = imageBytes): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    headers: new Headers({
      "content-type": contentType,
      "content-length": String(bytes.byteLength),
    }),
    arrayBuffer: async () => bytes.buffer,
  }));
}

describe("whatsapp-ai media", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "production", WHATSAPP_AI_ENABLE_IMAGES: "true" };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("aceita HTTPS público com MIME permitido informado pelo webhook", async () => {
    mockImageFetch();

    const image = await validateWhatsappAiImage({
      kind: "image",
      url: "https://cdn.exemplo.com/foto.jpg",
      mimeType: "image/jpeg",
      caption: null,
      fileLength: 1024,
    });

    expect(image).toEqual({
      url: "https://cdn.exemplo.com/foto.jpg",
      mediaType: "image/jpeg",
      sizeBytes: 1024,
      sourceHost: "cdn.exemplo.com",
      base64Data: Buffer.from(imageBytes).toString("base64"),
    });
  });

  it("rejeita localhost e IP privado", async () => {
    await expect(validateWhatsappAiImage({ kind: "image", url: "https://localhost/foto.jpg", mimeType: "image/jpeg", caption: null, fileLength: 1 })).rejects.toThrow("Host de imagem não permitido");
    await expect(validateWhatsappAiImage({ kind: "image", url: "https://192.168.0.10/foto.jpg", mimeType: "image/jpeg", caption: null, fileLength: 1 })).rejects.toThrow("Host de imagem não permitido");
  });

  it("rejeita MIME não permitido", async () => {
    await expect(validateWhatsappAiImage({
      kind: "image",
      url: "https://cdn.exemplo.com/foto.svg",
      mimeType: "image/svg+xml",
      caption: null,
      fileLength: 1024,
    })).rejects.toThrow("Tipo de imagem não suportado");
  });

  it("rejeita tamanho acima do limite", async () => {
    process.env.WHATSAPP_AI_MAX_IMAGE_BYTES = "100";

    await expect(validateWhatsappAiImage({
      kind: "image",
      url: "https://cdn.exemplo.com/foto.jpg",
      mimeType: "image/jpeg",
      caption: null,
      fileLength: 101,
    })).rejects.toThrow("Imagem maior que o limite permitido");
  });

  it("não valida imagens quando a feature flag está desligada", async () => {
    process.env.WHATSAPP_AI_ENABLE_IMAGES = "false";

    await expect(validateWhatsappAiImages([{ kind: "image", url: "https://cdn.exemplo.com/foto.jpg", mimeType: "image/jpeg", caption: null, fileLength: 1 }])).resolves.toEqual([]);
  });
});
