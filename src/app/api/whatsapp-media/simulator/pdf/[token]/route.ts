import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { verifySignedPayloadToken } from "@/lib/whatsapp/signed-payload-token";
import { renderSimulatorPdfBuffer } from "@/lib/pdf/simulator-builder";
import type { SimulatorPdfData } from "@/lib/pdf/simulator-pdf";

export const runtime = "nodejs";

/**
 * GET /api/whatsapp-media/simulator/pdf/[token]
 *
 * Rota PUBLICA (sem auth) que serve o PDF da SIMULACAO para a Meta Cloud baixar
 * ao enviar o template `simulacao_pdf` (HEADER DOCUMENT). A simulacao e
 * transiente: o token HMAC-assinado CARREGA o payload ja calculado (sem Redis,
 * sem banco) e tem TTL embutido. Paridade com o padrao OS, adaptado p/ dados
 * que nao existem como entidade.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const data = verifySignedPayloadToken<SimulatorPdfData>(token);
  if (!data) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
  }

  try {
    const pdfBuffer = await renderSimulatorPdfBuffer(data);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "public, max-age=300",
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    logger.error("simulator PDF error:", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
