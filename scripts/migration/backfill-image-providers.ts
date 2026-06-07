import { extractCloudinaryPublicId, inferImageProvider } from "../../src/lib/product-image-service"
import { prisma, withAdmin } from "../../src/server/db"

type BackfillTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
const isApply = process.argv.includes("--apply")

type Stats = {
  total: number
  cloudinary: number
  minio: number
  external: number
  unknown: number
  publicIdExtracted: number
  publicIdMissing: number
  updated: number
}

type StatsKey = "productPhotos" | "productVariations" | "catalogDevices"

const stats: Record<StatsKey, Stats> = {
  productPhotos: freshStats(),
  productVariations: freshStats(),
  catalogDevices: freshStats(),
}

function freshStats(): Stats {
  return {
    total: 0,
    cloudinary: 0,
    minio: 0,
    external: 0,
    unknown: 0,
    publicIdExtracted: 0,
    publicIdMissing: 0,
    updated: 0,
  }
}

function track(statsKey: StatsKey, url: string | null | undefined): {
  provider: "cloudinary" | "minio" | "external" | null
  publicId: string | null
} {
  const bucket = stats[statsKey]
  bucket.total += 1

  const provider = inferImageProvider(url)
  if (provider === "cloudinary") bucket.cloudinary += 1
  else if (provider === "minio") bucket.minio += 1
  else if (provider === "external") bucket.external += 1
  else bucket.unknown += 1

  const publicId = provider === "cloudinary" ? extractCloudinaryPublicId(url) : null
  if (provider === "cloudinary" && publicId) bucket.publicIdExtracted += 1
  if (provider === "cloudinary" && !publicId) bucket.publicIdMissing += 1

  return { provider, publicId }
}

async function backfillProductPhotos(tx: BackfillTx): Promise<void> {
  const photos = await tx.productPhoto.findMany({
    select: { id: true, url: true, provider: true, providerPublicId: true },
  })

  for (const photo of photos) {
    const { provider, publicId } = track("productPhotos", photo.url)
    if (!provider) continue
    if (photo.provider === provider && photo.providerPublicId === publicId) continue

    if (isApply) {
      await tx.productPhoto.update({
        where: { id: photo.id },
        data: { provider, providerPublicId: publicId },
      })
    }
    stats.productPhotos.updated += 1
  }
}

async function backfillProductVariations(tx: BackfillTx): Promise<void> {
  const variations = await tx.productVariation.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, imageUrl: true, imageProvider: true, imageProviderPublicId: true },
  })

  for (const variation of variations) {
    const { provider, publicId } = track("productVariations", variation.imageUrl)
    if (!provider) continue
    if (variation.imageProvider === provider && variation.imageProviderPublicId === publicId) continue

    if (isApply) {
      await tx.productVariation.update({
        where: { id: variation.id },
        data: { imageProvider: provider, imageProviderPublicId: publicId },
      })
    }
    stats.productVariations.updated += 1
  }
}

async function backfillCatalogDevices(tx: BackfillTx): Promise<void> {
  const devices = await tx.catalogDevice.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, imageUrl: true, imageProvider: true, imageProviderPublicId: true },
  })

  for (const device of devices) {
    const { provider, publicId } = track("catalogDevices", device.imageUrl)
    if (!provider) continue
    if (device.imageProvider === provider && device.imageProviderPublicId === publicId) continue

    if (isApply) {
      await tx.catalogDevice.update({
        where: { id: device.id },
        data: { imageProvider: provider, imageProviderPublicId: publicId },
      })
    }
    stats.catalogDevices.updated += 1
  }
}

async function main(): Promise<void> {
  await withAdmin(async (tx) => {
    await backfillProductPhotos(tx)
    await backfillProductVariations(tx)
    await backfillCatalogDevices(tx)
  })

  console.log(JSON.stringify({ mode: isApply ? "apply" : "dry-run", stats }, null, 2))
  if (!isApply) {
    console.log("Dry-run concluido. Execute com --apply para persistir os metadados.")
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
