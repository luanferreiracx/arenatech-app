import { logger } from "@/lib/logger";

const ALLOWED_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Faz upload da logo do tenant para o MinIO, processada para 400x200 max
 * (PNG transparente preservado). Retorna a URL publica que vai em
 * `tenant_settings.logoUrl`.
 *
 * SVG nao e processado (preserva original). PNG/JPG/WebP sao resized via
 * Sharp para no maximo 400x200 (fit=inside) e convertidos para PNG.
 */
export async function uploadTenantLogo(
  tenantId: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (!ALLOWED_MIMES.includes(mimeType)) {
    throw new Error("Formato nao suportado. Use PNG, JPG, WebP ou SVG.");
  }
  if (fileBuffer.length > MAX_SIZE_BYTES) {
    throw new Error("Logo excede 2MB. Reduza o arquivo antes de enviar.");
  }

  let finalBuffer: Buffer = fileBuffer;
  let finalMime = mimeType;
  let ext = "png";

  // SVG: armazena como esta (sem reprocessar — Sharp nao roda em vetorial).
  if (mimeType === "image/svg+xml") {
    ext = "svg";
  } else {
    // Raster: redimensiona via Sharp para max 400x200, exporta PNG (preserva transparencia).
    const sharp = (await import("sharp")).default;
    finalBuffer = await sharp(fileBuffer)
      .resize(400, 200, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    finalMime = "image/png";
    ext = "png";
  }

  // Cache-bust por timestamp para o navegador refletir nova logo apos upload.
  const key = `tenants/${tenantId}/logo-${Date.now()}.${ext}`;
  await uploadToMinio(key, finalBuffer, finalMime);

  const url = getMinioUrl(key);
  logger.info("Tenant logo uploaded", { tenantId, key, mime: finalMime });
  return url;
}

/**
 * Apaga a logo antiga do MinIO (best-effort — falha silenciosamente para
 * nao bloquear o upload da nova).
 */
export async function deleteTenantLogo(url: string): Promise<void> {
  const key = getKeyFromUrl(url);
  if (!key) return;
  try {
    await deleteFromMinio(key);
    logger.info("Tenant logo deleted", { key });
  } catch (error) {
    logger.warn("Failed to delete tenant logo", { key, error });
  }
}

// --- MinIO helpers (mesma config do product-image-service) ---

function getMinioEndpoint(): string {
  return process.env.S3_ENDPOINT || "http://localhost:9000";
}

function getMinioBucket(): string {
  return process.env.S3_BUCKET || "arenatech";
}

function getMinioUrl(key: string): string {
  // Servimos via proxy interno `/api/storage/[...path]` para nao expor MinIO
  // diretamente e ter cache controlado. NEXT_PUBLIC_APP_URL prefixa a URL
  // absoluta (necessario para o PDF binario baixar e para os clientes).
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api/storage/${key}`;
}

function getKeyFromUrl(url: string): string | null {
  // Novo formato: .../api/storage/{key}
  const proxyIdx = url.indexOf("/api/storage/");
  if (proxyIdx !== -1) return url.slice(proxyIdx + "/api/storage/".length);
  // Legacy: .../{bucket}/{key}
  const bucket = getMinioBucket();
  const bucketIdx = url.indexOf(`/${bucket}/`);
  if (bucketIdx !== -1) return url.slice(bucketIdx + bucket.length + 2);
  return null;
}

async function uploadToMinio(key: string, buffer: Buffer, contentType: string): Promise<void> {
  const endpoint = getMinioEndpoint();
  const bucket = getMinioBucket();
  const accessKey = process.env.S3_ACCESS_KEY || "minioadmin";
  const secretKey = process.env.S3_SECRET_KEY || "minioadmin";

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}

async function deleteFromMinio(key: string): Promise<void> {
  const endpoint = getMinioEndpoint();
  const bucket = getMinioBucket();
  const accessKey = process.env.S3_ACCESS_KEY || "minioadmin";
  const secretKey = process.env.S3_SECRET_KEY || "minioadmin";

  const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
