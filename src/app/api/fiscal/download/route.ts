import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { withTenant } from "@/server/db";
import { fetchInvoiceDocument } from "@/lib/services/fiscal-service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/fiscal/download?ref=<providerRef>&type=pdf|xml
 *
 * Baixa o DANFE (PDF) ou o XML de uma NF-e autorizada. Autentica o tenant e só
 * libera o documento se a invoice com aquele `providerRef` pertencer ao tenant
 * ativo (via RLS/withTenant). Busca os bytes reais na Nuvem Fiscal no servidor —
 * a API-key nunca vai ao cliente. Auditoria 2026-07-13 (I7): a rota era
 * referenciada por getInvoiceDocumentUrls mas não existia (download dava 404).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = resolveActiveTenant(session, req.cookies.get("x-active-tenant")?.value)?.id;
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const ref = req.nextUrl.searchParams.get("ref");
  const type = req.nextUrl.searchParams.get("type");
  if (!ref || (type !== "pdf" && type !== "xml")) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  // Ownership: a invoice com esse providerRef tem que ser do tenant ativo (RLS).
  const invoice = await withTenant(tenantId, (tx) =>
    tx.invoice.findFirst({
      where: { providerRef: ref, deletedAt: null },
      select: { id: true },
    }),
  );
  if (!invoice) {
    return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 });
  }

  try {
    const doc = await fetchInvoiceDocument(ref, type);
    if (!doc) {
      return NextResponse.json({ error: "Documento indisponível" }, { status: 404 });
    }
    return new NextResponse(doc.bytes, {
      status: 200,
      headers: {
        "Content-Type": doc.contentType,
        "Content-Disposition": `inline; filename="${doc.filename}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    logger.error("Falha ao baixar documento fiscal", { ref, type, error });
    return NextResponse.json({ error: "Falha ao baixar documento" }, { status: 502 });
  }
}
