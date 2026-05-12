import { NextResponse } from "next/server";
import { getOrderPdfData } from "../_helpers";
import { buildQuoteHtml } from "@/lib/service-order-pdfs";
import { withTenant } from "@/server/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getOrderPdfData(id);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Get the pending quote
  const url = new URL(req.url);
  const quoteId = url.searchParams.get("quoteId");

  const quote = await withTenant(result.tenantId, async (tx) => {
    if (quoteId) {
      return tx.serviceOrderQuote.findFirst({ where: { id: quoteId, orderId: id } });
    }
    // Fallback to latest pending quote
    return tx.serviceOrderQuote.findFirst({
      where: { orderId: id, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
  });

  if (!quote) {
    return NextResponse.json({ error: "Orcamento nao encontrado" }, { status: 404 });
  }

  const html = buildQuoteHtml({
    ...result.data,
    previousTotal: Number(quote.previousTotal),
    newTotal: Number(quote.newTotal),
    reason: quote.reason,
    additionalServices: quote.additionalServices,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
