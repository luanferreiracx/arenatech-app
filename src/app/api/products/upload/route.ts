import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/server/auth"
import { uploadProductImage, uploadVariationImage } from "@/lib/product-image-service"
import { isTenantAdmin } from "@/lib/auth/roles"
import { randomUUID } from "crypto"

const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const tenantId = session.activeTenantId
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant não selecionado" }, { status: 400 })
  }

  // Gestão de imagens de produto é ação de admin do tenant.
  if (!isTenantAdmin(session, tenantId)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const productId = formData.get("productId") as string | null
    const variationId = formData.get("variationId") as string | null

    if (!file || !productId) {
      return NextResponse.json({ error: "Arquivo e productId são obrigatórios" }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Imagem excede o limite de 10MB" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const mimeType = file.type

    if (variationId) {
      // Upload da imagem unica da variacao.
      const result = await uploadVariationImage(tenantId, productId, variationId, buffer, mimeType)
      return NextResponse.json(result)
    }

    // Upload product photo (3 versions)
    const photoId = randomUUID()
    const urls = await uploadProductImage(tenantId, productId, photoId, buffer, mimeType)
    return NextResponse.json({ id: photoId, ...urls })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no upload"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
