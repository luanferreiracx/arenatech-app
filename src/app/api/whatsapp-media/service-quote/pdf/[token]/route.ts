import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { verifySignedPayloadToken } from "@/lib/whatsapp/signed-payload-token";
import { renderServiceQuotePdfBuffer } from "@/lib/pdf/service-quote-builder";
import type { ServiceQuotePdfData } from "@/lib/pdf/service-quote-pdf";

export const runtime = "nodejs";

/**
 * GET /api/whatsapp-media/service-quote/pdf/[token]
 *
 * Rota PUBLICA (sem auth) que serve o PDF do ORCAMENTO DE SERVICO avulso para a
 * Meta Cloud baixar ao enviar o template `servico_orcamento_pdf` (HEADER
 * DOCUMENT). O orcamento e transiente (nao e entidade) — o token HMAC carrega o
 * payload ja calculado, com TTL embutido. Mesmo padrao do simulador.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const data = verifySignedPayloadToken<ServiceQuotePdfData>(token);
  if (!data) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
  }

  try {
    const pdfBuffer = await renderServiceQuotePdfBuffer(data);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "public, max-age=300",
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    logger.error("service-quote PDF error:", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
