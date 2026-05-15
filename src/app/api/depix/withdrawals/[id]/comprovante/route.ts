import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { withTenant } from "@/server/db";
import { PIX_KEY_TYPE_LABELS } from "@/lib/validators/depix-withdraw";

/**
 * GET /api/depix/withdrawals/[id]/comprovante
 *
 * Generates a transfer receipt HTML page for a completed (SENT) depix withdrawal.
 * Faithful to Laravel saques-depix/pdf/comprovante.blade.php layout.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const withdraw = await withTenant(tenantId, async (tx) => {
      return tx.depixWithdraw.findUnique({ where: { id } });
    });

    if (!withdraw) {
      return NextResponse.json(
        { error: "Saque nao encontrado" },
        { status: 404 }
      );
    }

    if (withdraw.status !== "SENT") {
      return NextResponse.json(
        { error: "Comprovante disponivel apenas para saques concluidos" },
        { status: 403 }
      );
    }

    const esc = (s: string | null | undefined) =>
      (s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const fmt = (v: number) =>
      `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const requestedAmount = Number(withdraw.requestedAmount);
    const updatedAtStr = withdraw.updatedAt.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const now = new Date();
    const nowStr = now.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const pixKeyTypeLabel =
      PIX_KEY_TYPE_LABELS[withdraw.pixKeyType] ?? withdraw.pixKeyType;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Comprovante - ${esc(withdraw.number)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #222;
    background: #fff;
    padding: 20px 24px;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  hr {
    border: none;
    border-top: 1px dashed #bbb;
    margin: 10px 0;
  }
  hr.solid {
    border-top: 1.5px solid #333;
    margin: 12px 0;
  }
  .header {
    text-align: center;
    margin-bottom: 6px;
  }
  .header .titulo {
    font-size: 16px;
    font-weight: bold;
    letter-spacing: 0.5px;
    color: #111;
  }
  .header .subtitulo {
    font-size: 10px;
    color: #666;
    margin-top: 3px;
  }
  .valor-box {
    text-align: center;
    background: #f0fdf4;
    border: 1.5px solid #22c55e;
    border-radius: 6px;
    padding: 10px 8px;
    margin: 10px 0;
  }
  .valor-box .label {
    font-size: 9px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }
  .valor-box .valor {
    font-size: 22px;
    font-weight: bold;
    color: #16a34a;
  }
  .section-label {
    font-size: 9px;
    font-weight: bold;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 4px;
  }
  table.info {
    width: 100%;
    border-collapse: collapse;
  }
  table.info td {
    padding: 2px 0;
    font-size: 10px;
    vertical-align: top;
  }
  table.info td.label {
    color: #777;
    width: 110px;
  }
  table.info td.value {
    color: #222;
    font-weight: 500;
    word-break: break-all;
  }
  .status-box {
    text-align: center;
    border: 1.5px solid #22c55e;
    background: #f0fdf4;
    padding: 6px;
    margin: 10px 0;
    border-radius: 4px;
  }
  .status-text {
    font-size: 12px;
    font-weight: bold;
    color: #16a34a;
    letter-spacing: 0.5px;
  }
  .footer {
    text-align: center;
    font-size: 8px;
    color: #999;
    margin-top: 12px;
    line-height: 1.5;
  }
  @media print { body { margin: 0; } }
</style>
</head>
<body>

<div class="header">
  <div class="titulo">COMPROVANTE DE TRANSFERENCIA PIX</div>
  <div class="subtitulo">Via Saque DePix</div>
</div>

<hr class="solid">

<div class="status-box">
  <div class="status-text">TRANSFERENCIA CONCLUIDA</div>
  <div style="font-size: 9px; color: #555; margin-top: 2px;">
    ${updatedAtStr}
  </div>
</div>

<div class="valor-box">
  <div class="label">Valor Pago</div>
  <div class="valor">${fmt(requestedAmount)}</div>
</div>

<hr>

<div class="section-label">Remetente</div>
<table class="info">
  <tr>
    <td class="label">Nome</td>
    <td class="value">PLEBZ INTERMEDIACAO DE PAGAMENTOS LTDA</td>
  </tr>
  <tr>
    <td class="label">CNPJ</td>
    <td class="value">45.808.899/0001-01</td>
  </tr>
</table>

<hr>

<div class="section-label">Destinatario</div>
<table class="info">
  <tr>
    <td class="label">Chave PIX</td>
    <td class="value">${esc(withdraw.pixKey)}</td>
  </tr>
  <tr>
    <td class="label">Tipo Chave</td>
    <td class="value">${esc(pixKeyTypeLabel)}</td>
  </tr>
  ${
    withdraw.recipientName
      ? `<tr>
    <td class="label">Beneficiario</td>
    <td class="value">${esc(withdraw.recipientName)}</td>
  </tr>`
      : ""
  }
</table>

<hr>

<div class="section-label">Identificacao</div>
<table class="info">
  <tr>
    <td class="label">Codigo</td>
    <td class="value">${esc(withdraw.number)}</td>
  </tr>
  ${
    withdraw.depixId
      ? `<tr>
    <td class="label">ID</td>
    <td class="value">${esc(withdraw.depixId)}</td>
  </tr>`
      : ""
  }
  ${
    withdraw.blockchainTxId
      ? `<tr>
    <td class="label">E2E</td>
    <td class="value" style="font-size: 8px;">${esc(withdraw.blockchainTxId)}</td>
  </tr>`
      : ""
  }
  <tr>
    <td class="label">Data/Hora</td>
    <td class="value">${updatedAtStr}</td>
  </tr>
</table>

<hr>

<div class="footer">
  Documento gerado em ${nowStr}<br>
  Comprovante nao fiscal - Saque #${esc(withdraw.number)}
</div>

</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("Depix comprovante generation error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
