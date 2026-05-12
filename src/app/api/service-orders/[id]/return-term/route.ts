import { NextResponse } from "next/server";
import { getOrderPdfData } from "../_helpers";
import { buildReturnTermHtml } from "@/lib/service-order-pdfs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getOrderPdfData(id);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const html = buildReturnTermHtml(result.data);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
