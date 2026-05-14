import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/simulator/pdf
 * Generates a PDF with the simulation results.
 *
 * Body: { nome, valorProduto, valorEntrada, valorFinanciar, debito, avista, parcelas }
 *
 * Returns an HTML page formatted for PDF printing (server-side rendering).
 * The client opens this in a new window and calls window.print().
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      nome = "Cliente",
      valorProduto = 0,
      valorEntrada = 0,
      valorFinanciar = 0,
      debito,
      avista,
      parcelas = [],
    } = body as {
      nome?: string;
      valorProduto: number;
      valorEntrada: number;
      valorFinanciar: number;
      debito: { taxa: number; total: number };
      avista: { taxa: number; total: number };
      parcelas: Array<{ n: number; taxa: number; total: number; parcela: number }>;
    };

    const fmt = (v: number) =>
      `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const parcelasRows = parcelas
      .map(
        (p) =>
          `<tr><td>${p.n}x</td><td class="num">${fmt(p.parcela)}</td><td class="num">${fmt(p.total)}</td></tr>`,
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>Simulacao de Parcelamento</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: helvetica, Arial, sans-serif; color: #1c1a16; margin: 0; padding: 28px 32px; font-size: 12px; line-height: 1.4; }
    .header { border-bottom: 3px solid #c9a84c; padding-bottom: 14px; margin-bottom: 22px; }
    .brand { color: #c9a84c; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
    .doc-title { color: #555; font-size: 13px; margin-top: 4px; }
    .saudacao { font-size: 14px; margin-bottom: 16px; }
    .saudacao b { color: #1c1a16; }
    .resumo { background: #f7f3e9; border-left: 4px solid #c9a84c; padding: 12px 16px; margin-bottom: 22px; border-radius: 4px; }
    .resumo-row { margin: 3px 0; font-size: 13px; }
    .resumo-row .label { color: #6b6358; display: inline-block; width: 160px; }
    .resumo-row .val { font-weight: 700; color: #1c1a16; }
    h2 { font-size: 14px; color: #c9a84c; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 1px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    thead th { background: #1c1a16; color: #c9a84c; font-weight: 600; text-align: left; padding: 9px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    tbody td { padding: 8px 12px; border-bottom: 1px solid #e5e0d2; font-size: 12px; }
    tbody tr:last-child td { border-bottom: none; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .destaque { color: #c9a84c; font-weight: 700; }
    .footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid #e5e0d2; font-size: 11px; color: #6b6358; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">Arena Tech</div>
    <div class="doc-title">Simulacao de Parcelamento</div>
  </div>
  <div class="saudacao">Ola, <b>${escapeHtml(nome)}</b>! Segue a simulacao solicitada:</div>
  <div class="resumo">
    ${
      valorEntrada > 0
        ? `<div class="resumo-row"><span class="label">Valor do produto:</span> <span class="val">${fmt(valorProduto)}</span></div>
           <div class="resumo-row"><span class="label">Entrada:</span> <span class="val">${fmt(valorEntrada)}</span></div>
           <div class="resumo-row"><span class="label">Valor a financiar:</span> <span class="val destaque">${fmt(valorFinanciar)}</span></div>`
        : `<div class="resumo-row"><span class="label">A vista no PIX:</span> <span class="val destaque">${fmt(valorProduto)}</span></div>`
    }
  </div>
  <h2>Debito</h2>
  <table>
    <thead><tr><th>Forma</th><th class="num">Total</th></tr></thead>
    <tbody><tr><td>Debito a vista</td><td class="num destaque">${fmt(debito.total)}</td></tr></tbody>
  </table>
  <h2>Credito</h2>
  <table>
    <thead><tr><th>Parcelas</th><th class="num">Valor da parcela</th><th class="num">Total</th></tr></thead>
    <tbody>
      <tr><td>1x a vista</td><td class="num">${fmt(avista.total)}</td><td class="num">${fmt(avista.total)}</td></tr>
      ${parcelasRows}
    </tbody>
  </table>
  <div class="footer">
    Simulacao valida por 1 (um) dia. Valores sujeitos a confirmacao no momento da venda.<br>
    Arena Tech &middot; ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ error: "Erro ao gerar PDF" }, { status: 500 });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
