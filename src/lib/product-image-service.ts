import { v2 as cloudinary, type UploadApiResponse } from "cloudinary"
import { logger } from "@/lib/logger"

export type ProductImageProvider = "cloudinary" | "minio" | "external"

export interface ProductImageMetadata {
  width?: number
  height?: number
  bytes?: number
  format?: string
  version?: number
  secureUrl?: string
}

export interface ProductPhotoUrls {
  url: string
  thumbUrl: string
  mediumUrl: string
  provider?: ProductImageProvider
  providerPublicId?: string | null
  metadata?: ProductImageMetadata
}

export interface VariationImageUploadResult {
  imageUrl: string
  imageProvider?: ProductImageProvider
  imageProviderPublicId?: string | null
  metadata?: ProductImageMetadata
}

export interface DeleteProductImageInput {
  url?: string | null
  provider?: string | null
  providerPublicId?: string | null
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
 * Processa e envia imagem de produto usando o provider configurado.
 * Cloudinary e o padrao para imagens publicas de produto; MinIO fica como rollback.
 */
export async function uploadProductImage(
  tenantId: string,
  productId: string,
  photoId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<ProductPhotoUrls> {
  validateImage(fileBuffer, mimeType)

  if (getProductImagesProvider() === "cloudinary") {
    return uploadProductImageToCloudinary(tenantId, productId, photoId, fileBuffer)
  }

  return uploadProductImageToMinio(tenantId, productId, photoId, fileBuffer)
}

/** Upload de imagem de variacao usando o provider configurado. */
export async function uploadVariationImage(
  tenantId: string,
  productId: string,
  variationId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<VariationImageUploadResult> {
  validateImage(fileBuffer, mimeType)

  if (getProductImagesProvider() === "cloudinary") {
    return uploadVariationImageToCloudinary(tenantId, productId, variationId, fileBuffer)
  }

  const imageUrl = await uploadVariationImageToMinio(tenantId, productId, variationId, fileBuffer)
  return { imageUrl, imageProvider: "minio", imageProviderPublicId: null }
}

/** Remove imagem do provider remoto em modo best-effort. */
export async function deleteProductImage(input: string | DeleteProductImageInput): Promise<void> {
  const payload: DeleteProductImageInput = typeof input === "string" ? { url: input } : input
  const provider = payload.provider ?? inferImageProvider(payload.url)

  if (provider === "cloudinary") {
    const publicId = payload.providerPublicId ?? extractCloudinaryPublicId(payload.url)
    if (!publicId) return
    try {
      configureCloudinary()
      await cloudinary.uploader.destroy(publicId, { resource_type: "image" })
      logger.info("Product image deleted from Cloudinary", { publicId })
    } catch (error) {
      logger.warn("Failed to delete image from Cloudinary", { publicId, error })
    }
    return
  }

  if (provider === "minio") {
    const key = getKeyFromUrl(payload.url ?? "")
    if (!key) return
    try {
      await deleteFromMinio(key)
      logger.info("Product image deleted from MinIO", { key })
    } catch (error) {
      logger.warn("Failed to delete image from MinIO", { key, error })
    }
  }
}

export function inferImageProvider(url?: string | null): ProductImageProvider | null {
  if (!url) return null
  if (url.includes("res.cloudinary.com") || url.includes("cloudinary.com")) return "cloudinary"
  const bucket = getMinioBucket()
  const endpoint = getMinioEndpoint()
  if (url.includes(`/${bucket}/`) || url.startsWith(endpoint)) return "minio"
  return "external"
}

export function extractCloudinaryPublicId(url?: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes("cloudinary.com")) return null
    const uploadMarker = "/upload/"
    const uploadIndex = parsed.pathname.indexOf(uploadMarker)
    if (uploadIndex === -1) return null
    let assetPath = parsed.pathname.slice(uploadIndex + uploadMarker.length)
    assetPath = assetPath.replace(/^v\d+\//, "")
    assetPath = assetPath.replace(/\.[a-zA-Z0-9]+$/, "")
    return decodeURIComponent(assetPath)
  } catch {
    return null
  }
}

function getProductImagesProvider(): "cloudinary" | "minio" {
  return process.env.PRODUCT_IMAGES_PROVIDER === "minio" ? "minio" : "cloudinary"
}

async function uploadProductImageToCloudinary(
  tenantId: string,
  productId: string,
  photoId: string,
  fileBuffer: Buffer
): Promise<ProductPhotoUrls> {
  configureCloudinary()
  const folder = getCloudinaryFolder(`tenants/${tenantId}/products/${productId}`)
  const result = await uploadBufferToCloudinary(fileBuffer, folder, photoId)
  const baseOptions = { secure: true, resource_type: "image" as const }

  logger.info("Product image uploaded to Cloudinary", {
    tenantId,
    productId,
    photoId,
    publicId: result.public_id,
  })

  return {
    url: cloudinary.url(result.public_id, {
      ...baseOptions,
      version: result.version,
      fetch_format: "auto",
      quality: "auto",
      width: 2000,
      height: 2000,
      crop: "limit",
    }),
    thumbUrl: cloudinary.url(result.public_id, {
      ...baseOptions,
      version: result.version,
      fetch_format: "auto",
      quality: "auto:good",
      width: 200,
      height: 200,
      crop: "fill",
      gravity: "auto",
    }),
    mediumUrl: cloudinary.url(result.public_id, {
      ...baseOptions,
      version: result.version,
      fetch_format: "auto",
      quality: "auto:good",
      width: 600,
      height: 600,
      crop: "limit",
    }),
    provider: "cloudinary",
    providerPublicId: result.public_id,
    metadata: toCloudinaryMetadata(result),
  }
}

async function uploadVariationImageToCloudinary(
  tenantId: string,
  productId: string,
  variationId: string,
  fileBuffer: Buffer
): Promise<VariationImageUploadResult> {
  configureCloudinary()
  const folder = getCloudinaryFolder(`tenants/${tenantId}/products/${productId}/variations`)
  const result = await uploadBufferToCloudinary(fileBuffer, folder, variationId)

  logger.info("Variation image uploaded to Cloudinary", {
    tenantId,
    productId,
    variationId,
    publicId: result.public_id,
  })

  return {
    imageUrl: cloudinary.url(result.public_id, {
      secure: true,
      resource_type: "image",
      version: result.version,
      fetch_format: "auto",
      quality: "auto:good",
      width: 600,
      height: 600,
      crop: "limit",
    }),
    imageProvider: "cloudinary",
    imageProviderPublicId: result.public_id,
    metadata: toCloudinaryMetadata(result),
  }
}

async function uploadBufferToCloudinary(
  fileBuffer: Buffer,
  folder: string,
  publicId: string
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        overwrite: true,
        use_filename: false,
        unique_filename: false,
      },
      (error, result) => {
        if (error) {
          reject(error)
          return
        }
        if (!result) {
          reject(new Error("Cloudinary nao retornou resultado do upload."))
          return
        }
        resolve(result)
      }
    )
    stream.end(fileBuffer)
  })
}

function configureCloudinary(): void {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET ausentes.")
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })
}

function getCloudinaryFolder(path: string): string {
  const root = process.env.CLOUDINARY_PRODUCT_FOLDER || "arenatech"
  return `${root}/${path}`.replace(/\/+/g, "/")
}

function toCloudinaryMetadata(result: UploadApiResponse): ProductImageMetadata {
  return {
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format,
    version: result.version,
    secureUrl: result.secure_url,
  }
}

async function uploadProductImageToMinio(
  tenantId: string,
  productId: string,
  photoId: string,
  fileBuffer: Buffer
): Promise<ProductPhotoUrls> {
  const basePath = `tenants/${tenantId}/products/${productId}`
  const urls: Record<string, string> = {}

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

  logger.info("Product image uploaded to MinIO", { tenantId, productId, photoId })

  return {
    url: urls["original"]!,
    thumbUrl: urls["thumb"]!,
    mediumUrl: urls["medium"]!,
    provider: "minio",
    providerPublicId: null,
  }
}

async function uploadVariationImageToMinio(
  tenantId: string,
  productId: string,
  variationId: string,
  fileBuffer: Buffer
): Promise<string> {
  const sharp = (await import("sharp")).default

  const processed = await sharp(fileBuffer)
    .resize(600, 600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer()

  const key = `tenants/${tenantId}/products/${productId}/variations/${variationId}.webp`
  await uploadToMinio(key, processed, "image/webp")

  logger.info("Variation image uploaded to MinIO", { tenantId, productId, variationId })
  return getMinioUrl(key)
}

function validateImage(buffer: Buffer, mimeType: string): void {
  if (!ALLOWED_MIMES.includes(mimeType)) {
    throw new Error(`Formato nao suportado. Use JPG, PNG ou WebP.`)
  }
  if (buffer.length > MAX_SIZE_BYTES) {
    throw new Error(`Imagem excede o limite de 10MB.`)
  }
  if (!hasValidImageMagic(buffer)) {
    throw new Error("Arquivo nao e uma imagem valida (JPG/PNG/WebP).")
  }
}

/** Verifica magic bytes JPG/PNG/WebP. */
function hasValidImageMagic(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return true
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return true
  return false
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
  if (process.env.NODE_ENV === "production" && (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY)) {
    throw new Error("S3_ACCESS_KEY/S3_SECRET_KEY ausentes em prod.")
  }
  const accessKey = process.env.S3_ACCESS_KEY || "minioadmin"
  const secretKey = process.env.S3_SECRET_KEY || "minioadmin"

  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3")

    const client = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
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
  if (process.env.NODE_ENV === "production" && (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY)) {
    throw new Error("S3_ACCESS_KEY/S3_SECRET_KEY ausentes em prod.")
  }
  const accessKey = process.env.S3_ACCESS_KEY || "minioadmin"
  const secretKey = process.env.S3_SECRET_KEY || "minioadmin"

  try {
    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3")

    const client = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
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
