import { isIP } from "node:net";
import type { WhatsappAiInboundAttachment } from "@/lib/whatsapp-ai-agent/evolution-payload";

export type ValidatedWhatsappAiImage = {
  url: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number | null;
  sourceHost: string;
};

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MEDIA_VALIDATION_TIMEOUT_MS = 5_000;

function maxImageBytes(): number {
  const parsed = Number(process.env.WHATSAPP_AI_MAX_IMAGE_BYTES);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_MAX_IMAGE_BYTES;
}

function mediaAllowHttp(): boolean {
  return process.env.WHATSAPP_AI_MEDIA_ALLOW_HTTP === "true" || process.env.NODE_ENV !== "production";
}

export function whatsappAiImagesEnabled(): boolean {
  return process.env.WHATSAPP_AI_ENABLE_IMAGES === "true";
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  if (first === undefined || second === undefined) return false;

  return (
    first === 10 ||
    first === 127 ||
    first === 0 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) === 6) return isPrivateIpv6(normalized);
  return false;
}

function normalizeMimeType(value: string | null): string | null {
  if (!value) return null;
  return value.split(";")[0]?.trim().toLowerCase() || null;
}

function assertAllowedUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL de imagem inválida");
  }

  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && mediaAllowHttp())) {
    throw new Error("URL de imagem deve usar HTTPS");
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error("Host de imagem não permitido");
  }

  return parsed;
}

function assertAllowedMimeType(mimeType: string | null): asserts mimeType is ValidatedWhatsappAiImage["mediaType"] {
  if (!mimeType || !ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error("Tipo de imagem não suportado. Envie JPG, PNG ou WebP.");
  }
}

function assertAllowedSize(sizeBytes: number | null): void {
  if (sizeBytes !== null && sizeBytes > maxImageBytes()) {
    throw new Error("Imagem maior que o limite permitido");
  }
}

async function readRemoteImageMetadata(url: URL): Promise<{ mimeType: string | null; sizeBytes: number | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MEDIA_VALIDATION_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("Não foi possível validar a imagem recebida");
    }
    const contentLength = response.headers.get("content-length");
    const parsedLength = contentLength ? Number(contentLength) : Number.NaN;
    return {
      mimeType: normalizeMimeType(response.headers.get("content-type")),
      sizeBytes: Number.isFinite(parsedLength) ? parsedLength : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateWhatsappAiImage(attachment: WhatsappAiInboundAttachment): Promise<ValidatedWhatsappAiImage> {
  const parsedUrl = assertAllowedUrl(attachment.url);
  const webhookMimeType = normalizeMimeType(attachment.mimeType);
  const webhookSizeBytes = attachment.fileLength;

  assertAllowedSize(webhookSizeBytes);

  if (webhookMimeType && webhookSizeBytes !== null) {
    assertAllowedMimeType(webhookMimeType);
    return {
      url: parsedUrl.toString(),
      mediaType: webhookMimeType,
      sizeBytes: webhookSizeBytes,
      sourceHost: parsedUrl.hostname,
    };
  }

  const remoteMetadata = await readRemoteImageMetadata(parsedUrl);
  const mimeType = webhookMimeType ?? remoteMetadata.mimeType;
  const sizeBytes = webhookSizeBytes ?? remoteMetadata.sizeBytes;

  assertAllowedMimeType(mimeType);
  assertAllowedSize(sizeBytes);

  return {
    url: parsedUrl.toString(),
    mediaType: mimeType,
    sizeBytes,
    sourceHost: parsedUrl.hostname,
  };
}

export async function validateWhatsappAiImages(attachments: WhatsappAiInboundAttachment[]): Promise<ValidatedWhatsappAiImage[]> {
  if (!whatsappAiImagesEnabled()) return [];

  const maxImages = Number(process.env.WHATSAPP_AI_MAX_IMAGES_PER_MESSAGE || 1);
  const imageAttachments = attachments.filter((attachment) => attachment.kind === "image").slice(0, maxImages);
  const images: ValidatedWhatsappAiImage[] = [];
  for (const attachment of imageAttachments) {
    images.push(await validateWhatsappAiImage(attachment));
  }
  return images;
}
