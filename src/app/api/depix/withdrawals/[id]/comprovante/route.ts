import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant } from "@/server/db";
import { PIX_KEY_TYPE_LABELS } from "@/lib/validators/depix-withdraw";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { loadTenantHeader } from "@/lib/pdf/tenant-header";
import { DepixWithdrawReceiptPdf } from "@/lib/pdf/depix-withdraw-receipt-pdf";

/**
 * GET /api/depix/withdrawals/[id]/comprovante
 *
 * Gera PDF do comprovante de saque DePix concluido.
 * Paridade Laravel saques-depix/pdf/comprovante.blade.php (Dompdf -> A5 PDF).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId =
    req.cookies.get("x-active-tenant")?.value ?? session.activeTenantId;

  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  try {
    const withdraw = await withTenant(tenantId, async (tx) =>
      tx.depixWithdraw.findUnique({ where: { id } }),
    );

    if (!withdraw) {
      return NextResponse.json({ error: "Saque nao encontrado" }, { status: 404 });
    }
    if (withdraw.status !== "SENT") {
      return NextResponse.json(
        { error: "Comprovante disponivel apenas para saques concluidos" },
        { status: 403 },
      );
    }

    const header = await loadTenantHeader(tenantId);

    const buffer = await renderPdfToBuffer(
      DepixWithdrawReceiptPdf({
        withdraw: {
          number: withdraw.number,
          pixKeyTypeLabel:
            PIX_KEY_TYPE_LABELS[withdraw.pixKeyType] ?? withdraw.pixKeyType,
          pixKey: withdraw.pixKey,
          recipientName: withdraw.recipientName,
          recipientTaxId: withdraw.recipientTaxId,
          notes: withdraw.notes,
          requestedAmount: Number(withdraw.requestedAmount),
          fee: withdraw.fee != null ? Number(withdraw.fee) : null,
          depositAmount:
            withdraw.depositAmount != null ? Number(withdraw.depositAmount) : null,
          receivedAmount:
            withdraw.receivedAmount != null ? Number(withdraw.receivedAmount) : null,
          depixId: withdraw.depixId,
          blockchainTxId: withdraw.blockchainTxId,
          updatedAt: withdraw.updatedAt,
          createdAt: withdraw.createdAt,
          userName: withdraw.userName,
        },
        store: {
          name: header.storeName,
          cnpj: header.cnpj,
          phone: header.phone,
          address: header.address,
          logoDataUrl: header.logoDataUrl,
        },
      }),
    );

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="comprovante-saque-${withdraw.number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("Depix comprovante generation error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
