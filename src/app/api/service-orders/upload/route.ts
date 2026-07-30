import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/server/auth"
import { uploadEntityImage } from "@/lib/product-image-service"
import { randomUUID } from "crypto"
import { isModuleAllowedForTenant, moduleDeniedMessage } from "@/server/auth/module-gate";

const MAX_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * Upload de FOTO do aparelho de uma OS. Reusa a mesma infra de imagem do catálogo
 * (uploadEntityImage → Cloudinary/MinIO, 3 versões). Diferente das fotos de
 * produto (admin), aqui qualquer membro do tenant pode enviar — o técnico/operador
 * é quem manuseia o aparelho. A persistência (serviceOrder.addPhoto) reconfirma
 * que a OS pertence ao tenant.
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  const tenantId = session.activeTenantId
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant não selecionado" }, { status: 400 })
  }

  // Gating de plano na borda REST: o proxy isenta `/api/*` de propósito e o
  // `tenantProcedure` não passa por aqui. Sem isto, um tenant sem o módulo
  // baixava este arquivo pela rota REST mesmo sem conseguir chamar o tRPC.
  if (!isModuleAllowedForTenant(session, tenantId, "service-orders")) {
    return NextResponse.json({ error: moduleDeniedMessage("service-orders") }, { status: 403 });
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const orderId = formData.get("orderId") as string | null

    if (!file || !orderId) {
      return NextResponse.json({ error: "Arquivo e orderId são obrigatórios" }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Imagem excede o limite de 10MB" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const photoId = randomUUID()
    const urls = await uploadEntityImage(tenantId, "service-orders", orderId, photoId, buffer, file.type)
    return NextResponse.json({ id: photoId, ...urls })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no upload"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
