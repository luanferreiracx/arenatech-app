import { logger } from "@/lib/logger"

export interface ProductPhotoUrls {
  url: string
  thumbUrl: string
  mediumUrl: string
}

interface ImageVersion {
  suffix: string
  width: number
  height: number
  quality: number
  fit: "cover" | "inside"
}

const VERSIONS: ImageVersion[] = [
  { suffix: "thumb", width: 200, height: 200, quality: 80, fit: "cover" },
  { suffix: "medium", width: 600, height: 600, quality: 85, fit: "inside" },
  { suffix: "original", width: 2000, height: 2000, quality: 90, fit: "inside" },
]

const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"]
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

/**
 * Process and upload product image to MinIO via Sharp.
 * Generates 3 versions: thumb (200x200), medium (600x600), original (max 2000x2000).
 * All converted to WebP.
 */
export async function uploadProductImage(
  tenantId: string,
  productId: string,
  photoId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<ProductPhotoUrls> {
  validateImage(fileBuffer, mimeType)

  const basePath = `tenants/${tenantId}/products/${productId}`
  const urls: Record<string, string> = {}

  // Dynamic import sharp (it's a native module, avoid bundling issues)
  const sharp = (await import("sharp")).default

  for (const version of VERSIONS) {
    const processed = await sharp(fileBuffer)
      .resize(version.width, version.height, { fit: version.fit, withoutEnlargement: true })
      .webp({ quality: version.quality })
      .toBuffer()

    const key = `${basePath}/${photoId}-${version.suffix}.webp`
    await uploadToMinio(key, processed, "image/webp")
    urls[version.suffix] = getMinioUrl(key)
  }

  logger.info("Product image uploaded", { tenantId, productId, photoId })

  return {
    url: urls["original"]!,
    thumbUrl: urls["thumb"]!,
    mediumUrl: urls["medium"]!,
  }
}

/**
 * Upload variation image to MinIO.
 */
export async function uploadVariationImage(
  tenantId: string,
  productId: string,
  variationId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  validateImage(fileBuffer, mimeType)

  const sharp = (await import("sharp")).default

  const processed = await sharp(fileBuffer)
    .resize(600, 600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer()

  const key = `tenants/${tenantId}/products/${productId}/variations/${variationId}.webp`
  await uploadToMinio(key, processed, "image/webp")

  logger.info("Variation image uploaded", { tenantId, productId, variationId })
  return getMinioUrl(key)
}

/**
 * Delete image from MinIO by URL.
 */
export async function deleteProductImage(url: string): Promise<void> {
  const key = getKeyFromUrl(url)
  if (!key) return

  try {
    await deleteFromMinio(key)
    logger.info("Product image deleted", { key })
  } catch (error) {
    logger.warn("Failed to delete image from MinIO", { key, error })
  }
}

function validateImage(buffer: Buffer, mimeType: string): void {
  if (!ALLOWED_MIMES.includes(mimeType)) {
    throw new Error(`Formato não suportado. Use JPG, PNG ou WebP.`)
  }
  if (buffer.length > MAX_SIZE_BYTES) {
    throw new Error(`Imagem excede o limite de 10MB.`)
  }
}

// --- MinIO helpers ---

function getMinioEndpoint(): string {
  return process.env.S3_ENDPOINT || "http://localhost:9000"
}

function getMinioBucket(): string {
  return process.env.S3_BUCKET || "arenatech"
}

function getMinioUrl(key: string): string {
  return `${getMinioEndpoint()}/${getMinioBucket()}/${key}`
}

function getKeyFromUrl(url: string): string | null {
  const bucket = getMinioBucket()
  const idx = url.indexOf(`/${bucket}/`)
  if (idx === -1) return null
  return url.slice(idx + bucket.length + 2)
}

async function uploadToMinio(key: string, buffer: Buffer, contentType: string): Promise<void> {
  const endpoint = getMinioEndpoint()
  const bucket = getMinioBucket()
  const accessKey = process.env.S3_ACCESS_KEY || "minioadmin"
  const secretKey = process.env.S3_SECRET_KEY || "minioadmin"

  // Use aws-sdk v3 style or simple PUT
  // For simplicity, use @aws-sdk/client-s3 if available, else mock
  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3")

    const client = new S3Client({
      region: "us-east-1",
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    })

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    )
  } catch (error) {
    // If AWS SDK not installed or MinIO not available, log and continue (dev mode)
    if (process.env.NODE_ENV === "development") {
      logger.warn("MinIO upload skipped (dev mode or SDK unavailable)", { key })
      return
    }
    throw error
  }
}

async function deleteFromMinio(key: string): Promise<void> {
  const endpoint = getMinioEndpoint()
  const bucket = getMinioBucket()
  const accessKey = process.env.S3_ACCESS_KEY || "minioadmin"
  const secretKey = process.env.S3_SECRET_KEY || "minioadmin"

  try {
    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3")

    const client = new S3Client({
      region: "us-east-1",
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    })

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    )
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      logger.warn("MinIO delete skipped (dev mode)", { key })
      return
    }
    throw error
  }
}
