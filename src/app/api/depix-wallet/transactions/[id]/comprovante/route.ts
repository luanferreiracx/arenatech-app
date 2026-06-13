import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { withTenant } from "@/server/db";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { loadTenantHeader } from "@/lib/pdf/tenant-header";
import { DepixTxReceiptPdf } from "@/lib/pdf/depix-transaction-receipt-pdf";
import { DEPIX_TX_STATUS_LABELS } from "@/lib/validators/depix-transaction";

export const runtime = "nodejs";

function isSafeReceiptUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * GET /api/depix-wallet/transactions/[id]/comprovante
 *
 * Gera PDF (A5) do comprovante de uma transacao DePix multi-tenant
 * (deposito ou saque). Disponivel apos COMPLETED ou PROCESSING (protocolo).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = resolveActiveTenant(session, req.cookies.get("x-active-tenant")?.value)?.id;
  if (!tenantId) return NextResponse.json({ error: "No active tenant" }, { status: 403 });

  try {
    const tx = await withTenant(tenantId, async (db) =>
      db.tenantDepixTransaction.findUnique({ where: { id } }),
    );
    if (!tx) return NextResponse.json({ error: "Transacao nao encontrada" }, { status: 404 });

    if (tx.status === "PENDING" || tx.status === "FAILED" || tx.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Comprovante disponivel apenas para transacoes em processamento ou concluidas" },
        { status: 403 },
      );
    }

    if (tx.kind === "WITHDRAW" && tx.status === "COMPLETED" && isSafeReceiptUrl(tx.pixpayReceiptUrl)) {
      return NextResponse.redirect(tx.pixpayReceiptUrl, 302);
    }

    const header = await loadTenantHeader(tenantId);

    const buffer = await renderPdfToBuffer(
      DepixTxReceiptPdf({
        tx: {
          number: tx.number,
          kind: tx.kind,
          statusLabel: DEPIX_TX_STATUS_LABELS[tx.status] ?? tx.status,
          grossAmountCents: tx.grossAmountCents,
          feeArenaTechCents: tx.feeArenaTechCents,
          feePixPayCents: tx.feePixPayCents,
          netAmountCents: tx.netAmountCents,
          pixKeyType: tx.pixKeyType,
          pixKey: tx.pixKey,
          recipientName: tx.recipientName,
          recipientTaxId: tx.recipientTaxId,
          withdrawTxId: tx.withdrawTxId,
          depositTxId: tx.depositTxId,
          depositAddress: tx.depositAddress,
          pixpayDepixId: tx.pixpayDepixId,
          payerTaxId: tx.payerTaxId,
          payerPhone: tx.payerPhone,
          createdAt: tx.createdAt,
          completedAt: tx.completedAt,
          userName: tx.userName,
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
        "Content-Disposition": `inline; filename="depix-${tx.number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logger.error("DePix tx comprovante erro", { err: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
