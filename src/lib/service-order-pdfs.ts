/**
 * PDF HTML generators for Service Order documents:
 * - Delivery Term (Termo de Entrega)
 * - Return Term (Termo de Devolucao)
 * - Receipt (Recibo)
 * - Quote (Orcamento)
 *
 * Each function generates a standalone HTML document suitable for
 * print-to-PDF (window.print()) or server-side rendering.
 */

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("pt-BR");
}

function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("pt-BR");
}

function valorPorExtenso(valor: number): string {
  const unidades = ["", "um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const dezADezenove = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function numExtenso(n: number): string {
    if (n === 0) return "zero";
    if (n === 100) return "cem";
    let r = "";
    if (n >= 1000) {
      const milhar = Math.floor(n / 1000);
      r += milhar === 1 ? "mil" : numExtenso(milhar) + " mil";
      n %= 1000;
      if (n > 0) r += " e ";
    }
    if (n >= 100) {
      r += centenas[Math.floor(n / 100)] ?? "";
      n %= 100;
      if (n > 0) r += " e ";
    }
    if (n >= 10 && n <= 19) {
      r += dezADezenove[n - 10] ?? "";
    } else if (n >= 20) {
      r += dezenas[Math.floor(n / 10)] ?? "";
      n %= 10;
      if (n > 0) r += " e " + (unidades[n] ?? "");
    } else if (n > 0) {
      r += unidades[n] ?? "";
    }
    return r;
  }

  const str = valor.toFixed(2);
  const [inteiro, centavos] = str.split(".");
  const inteiroNum = parseInt(inteiro ?? "0", 10);
  const centavosNum = parseInt(centavos ?? "0", 10);

  let extenso = numExtenso(inteiroNum);
  extenso += inteiroNum === 1 ? " real" : " reais";

  if (centavosNum > 0) {
    extenso += " e " + numExtenso(centavosNum);
    extenso += centavosNum === 1 ? " centavo" : " centavos";
  }

  return extenso;
}

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface OrderPdfData {
  tenantName: string;
  tenantCnpj: string | null;
  tenantPhone: string | null;
  number: string;
  status: string;
  customerName: string;
  customerCpf: string | null;
  customerPhone: string | null;
  deviceType: string | null;
  deviceModel: string | null;
  imei: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  serviceAmount: number;
  partsAmount: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  paymentMethod: string | null;
  paymentDiscount: number;
  warrantyMonths: number;
  completedDate: Date | string | null;
  reportedProblem: string | null;
}

export interface QuotePdfData extends OrderPdfData {
  previousTotal: number;
  newTotal: number;
  reason: string;
  additionalServices: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Delivery Term
// ────────────────────────────────────────────────────────────────────────────

export function buildDeliveryTermHtml(data: OrderPdfData): string {
  const cnpjFmt = data.tenantCnpj ? ` - CNPJ: ${esc(data.tenantCnpj)}` : "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Termo de Entrega - ${esc(data.number)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11pt; margin: 20px; }
  .header { border-bottom: 3px solid #28a745; padding-bottom: 15px; margin-bottom: 20px; }
  .title { text-align: center; font-size: 18pt; font-weight: bold; margin: 20px 0; color: #28a745; background: #e8f5e9; padding: 15px; border-radius: 8px; }
  .info-box { background: #f5f5f5; border-left: 4px solid #28a745; padding: 15px; margin: 15px 0; }
  .info-row { margin: 8px 0; }
  .label { font-weight: bold; color: #555; }
  .equip-box { border: 2px solid #ddd; border-radius: 8px; padding: 15px; margin: 20px 0; background: #fafafa; }
  .equip-title { font-size: 14pt; font-weight: bold; color: #28a745; margin-bottom: 10px; }
  .text { text-align: justify; line-height: 1.8; margin: 20px 0; }
  .signature { margin-top: 60px; text-align: center; }
  .sig-line { border-top: 2px solid #000; width: 400px; margin: 0 auto; padding-top: 5px; font-weight: bold; }
  .footer { text-align: center; font-size: 8pt; color: #999; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 10px; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #28a745; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
  @media print { .print-btn { display: none; } @page { margin: 15mm; } }
</style></head><body>
  <button class="print-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
  <div class="header">
    <div style="font-size:11pt;font-weight:bold;color:#28a745;">${esc(data.tenantName)}${cnpjFmt}</div>
    <div style="font-size:9pt;color:#666;">Assistencia Tecnica Especializada</div>
    ${data.tenantPhone ? `<div style="font-size:9pt;color:#666;">${esc(data.tenantPhone)}</div>` : ""}
  </div>
  <div class="title">TERMO DE ENTREGA DE EQUIPAMENTO</div>
  <div class="info-box">
    <div class="info-row"><span class="label">Ordem de Servico:</span> ${esc(data.number)}</div>
    <div class="info-row"><span class="label">Data de Entrega:</span> ${formatDateTime(new Date())}</div>
    <div class="info-row"><span class="label">Cliente:</span> ${esc(data.customerName)}</div>
    ${data.customerCpf ? `<div class="info-row"><span class="label">CPF:</span> ${esc(data.customerCpf)}</div>` : ""}
    ${data.customerPhone ? `<div class="info-row"><span class="label">Telefone:</span> ${esc(data.customerPhone)}</div>` : ""}
  </div>
  <div class="equip-box">
    <div class="equip-title">EQUIPAMENTO ENTREGUE</div>
    ${data.deviceType ? `<div class="info-row"><span class="label">Tipo:</span> ${esc(data.deviceType)}</div>` : ""}
    ${data.deviceModel ? `<div class="info-row"><span class="label">Modelo:</span> ${esc(data.deviceModel)}</div>` : ""}
    ${data.imei ? `<div class="info-row"><span class="label">IMEI/Serie:</span> ${esc(data.imei)}</div>` : ""}
  </div>
  <div class="text">
    <p>Declaro ter recebido o equipamento acima descrito, apos a realizacao dos servicos de assistencia tecnica conforme Ordem de Servico <strong>${esc(data.number)}</strong>.</p>
    <p>Declaro que conferi o funcionamento do equipamento no ato da entrega, nao tendo nenhuma reclamacao a fazer neste momento.</p>
    <p style="margin-top:15px;font-size:10pt;color:#666;"><em>* Informacoes sobre valor, garantia e detalhes do servico constam no Recibo de Servico.</em></p>
  </div>
  <div class="signature">
    <div class="sig-line">Assinatura do Cliente</div>
    <p style="font-size:9pt;color:#666;margin-top:5px;">${esc(data.customerName)}<br/>CPF: ${esc(data.customerCpf ?? "")}</p>
  </div>
  <div class="footer">Documento gerado em ${formatDateTime(new Date())} - OS: ${esc(data.number)}</div>
</body></html>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Return Term
// ────────────────────────────────────────────────────────────────────────────

export function buildReturnTermHtml(data: OrderPdfData): string {
  const cnpjFmt = data.tenantCnpj ? ` - CNPJ: ${esc(data.tenantCnpj)}` : "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Termo de Devolucao - ${esc(data.number)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11pt; margin: 20px; }
  .header { border-bottom: 3px solid #FF6B35; padding-bottom: 15px; margin-bottom: 20px; }
  .title { text-align: center; font-size: 18pt; font-weight: bold; margin: 20px 0; color: #333; }
  .info-box { background: #f5f5f5; border-left: 4px solid #FF6B35; padding: 15px; margin: 15px 0; }
  .info-row { margin: 8px 0; }
  .label { font-weight: bold; color: #555; }
  .equip-box { border: 2px solid #ddd; border-radius: 8px; padding: 15px; margin: 20px 0; background: #fafafa; }
  .equip-title { font-size: 14pt; font-weight: bold; color: #FF6B35; margin-bottom: 10px; }
  .text { text-align: justify; line-height: 1.8; margin: 20px 0; }
  .signature { margin-top: 60px; text-align: center; }
  .sig-line { border-top: 2px solid #000; width: 400px; margin: 0 auto; padding-top: 5px; font-weight: bold; }
  .footer { text-align: center; font-size: 8pt; color: #999; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 10px; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #FF6B35; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
  @media print { .print-btn { display: none; } @page { margin: 15mm; } }
</style></head><body>
  <button class="print-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
  <div class="header">
    <div style="font-size:11pt;font-weight:bold;color:#FF6B35;">${esc(data.tenantName)}${cnpjFmt}</div>
    <div style="font-size:9pt;color:#666;">Assistencia Tecnica Especializada</div>
    ${data.tenantPhone ? `<div style="font-size:9pt;color:#666;">${esc(data.tenantPhone)}</div>` : ""}
  </div>
  <div class="title">TERMO DE DEVOLUCAO DE EQUIPAMENTO</div>
  <div class="info-box">
    <div class="info-row"><span class="label">Ordem de Servico:</span> ${esc(data.number)}</div>
    <div class="info-row"><span class="label">Data de Devolucao:</span> ${formatDateTime(new Date())}</div>
    <div class="info-row"><span class="label">Cliente:</span> ${esc(data.customerName)}</div>
    ${data.customerCpf ? `<div class="info-row"><span class="label">CPF:</span> ${esc(data.customerCpf)}</div>` : ""}
    ${data.customerPhone ? `<div class="info-row"><span class="label">Telefone:</span> ${esc(data.customerPhone)}</div>` : ""}
  </div>
  <div class="equip-box">
    <div class="equip-title">DADOS DO EQUIPAMENTO DEVOLVIDO</div>
    ${data.deviceType ? `<div class="info-row"><span class="label">Tipo:</span> ${esc(data.deviceType)}</div>` : ""}
    ${data.deviceModel ? `<div class="info-row"><span class="label">Modelo:</span> ${esc(data.deviceModel)}</div>` : ""}
    ${data.imei ? `<div class="info-row"><span class="label">IMEI/Serie:</span> ${esc(data.imei)}</div>` : ""}
  </div>
  <div class="text">
    <p>Declaro ter recebido o equipamento acima descrito, devolvido nas mesmas condicoes em que foi entregue para analise/reparo, conforme Ordem de Servico <strong>${esc(data.number)}</strong>.</p>
    <p>Estou ciente de que o equipamento foi devolvido sem a realizacao do servico solicitado, seja por motivo de cancelamento, nao aprovacao do orcamento, ou outro motivo acordado entre as partes.</p>
    <p>Declaro que conferi o equipamento e seus acessorios (se houver) e os recebi em perfeito estado, nao tendo nenhuma reclamacao a fazer neste momento.</p>
  </div>
  <div class="signature">
    <div class="sig-line">Assinatura do Cliente</div>
    <p style="font-size:9pt;color:#666;margin-top:5px;">${esc(data.customerName)}<br/>CPF: ${esc(data.customerCpf ?? "")}</p>
  </div>
  <div class="footer">Documento gerado em ${formatDateTime(new Date())} - OS: ${esc(data.number)}</div>
</body></html>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Receipt
// ────────────────────────────────────────────────────────────────────────────

export function buildReceiptHtml(data: OrderPdfData): string {
  const cnpjFmt = data.tenantCnpj ? ` - CNPJ: ${esc(data.tenantCnpj)}` : "";
  const valorPago = data.paidAmount > 0 ? data.paidAmount : data.totalAmount;
  const extenso = valorPorExtenso(valorPago);
  const warrantyEndDate = data.completedDate
    ? new Date(new Date(data.completedDate).getTime() + data.warrantyMonths * 30 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + data.warrantyMonths * 30 * 24 * 60 * 60 * 1000);

  const itemsHtml = data.items.length > 0
    ? `<ul style="margin:10px 0;padding-left:20px;">${data.items.map((item) => `<li style="margin:5px 0;"><strong>${esc(item.description)}</strong>${item.quantity > 1 ? ` (${item.quantity}x ${formatMoney(item.unitPrice)})` : ""} - ${formatMoney(item.total)}</li>`).join("")}</ul>`
    : "<p><strong>Assistencia Tecnica</strong></p>";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Recibo - ${esc(data.number)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; margin: 20px; }
  .header { border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
  .header-recibo { text-align: center; border: 2px solid #000; padding: 10px; margin-bottom: 12px; background: #f9f9f9; }
  .header-recibo h1 { font-size: 18pt; margin: 0; color: #333; }
  .valor-box { background: #fff; color: #000; border: 2px solid #000; padding: 12px; text-align: center; margin: 12px 0; border-radius: 8px; }
  .valor-num { font-size: 18pt; font-weight: bold; }
  .corpo { text-align: justify; line-height: 1.6; margin: 15px 0; font-size: 11pt; }
  .servico-box { background: #f5f5f5; border-left: 4px solid #000; padding: 12px; margin: 15px 0; }
  .servico-titulo { font-weight: bold; color: #000; font-size: 13pt; margin-bottom: 10px; }
  .garantia-box { background: #e8f5e9; border: 2px dashed #4caf50; padding: 12px; margin: 15px 0; border-radius: 8px; }
  .garantia-titulo { font-weight: bold; color: #2e7d32; font-size: 12pt; margin-bottom: 5px; }
  .signature { margin-top: 40px; text-align: center; }
  .sig-line { border-top: 2px solid #000; width: 450px; margin: 0 auto; padding-top: 8px; font-weight: bold; font-size: 11pt; }
  .footer { text-align: center; font-size: 8pt; color: #999; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 10px; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #000; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
  @media print { .print-btn { display: none; } @page { margin: 15mm; } }
</style></head><body>
  <button class="print-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
  <div class="header">
    <div style="font-size:11pt;font-weight:bold;">${esc(data.tenantName)}${cnpjFmt}</div>
    <div style="font-size:9pt;color:#666;">Assistencia Tecnica Especializada</div>
    ${data.tenantPhone ? `<div style="font-size:9pt;color:#666;">${esc(data.tenantPhone)}</div>` : ""}
  </div>
  <div class="header-recibo">
    <h1>RECIBO</h1>
    <p style="margin:3px 0;font-size:10pt;"><strong>No:</strong> ${esc(data.number)}</p>
    <p style="margin:3px 0;font-size:10pt;"><strong>Data de Emissao:</strong> ${formatDate(new Date())}</p>
  </div>
  <div class="valor-box">
    <div class="valor-num">${formatMoney(valorPago)}</div>
    <div style="margin-top:5px;font-size:10pt;">(${extenso})</div>
    ${data.paymentDiscount > 0 ? `<div style="margin-top:8px;font-size:9pt;color:#28a745;"><strong>Desconto no pagamento:</strong> ${formatMoney(data.paymentDiscount)} (Valor original: ${formatMoney(data.totalAmount)})</div>` : ""}
    ${data.paymentMethod ? `<div style="margin-top:5px;font-size:9pt;"><strong>Forma de Pagamento:</strong> ${esc(data.paymentMethod)}</div>` : ""}
  </div>
  <div class="corpo">
    Recebi(emos) de <strong>${esc(data.customerName)}</strong>,
    portador(a) do CPF <strong>${esc(data.customerCpf ?? "")}</strong>,
    a quantia de <strong>${formatMoney(valorPago)}</strong> (${extenso}),
    referente ao(s) servico(s) de assistencia tecnica prestado(s) conforme
    Ordem de Servico <strong>${esc(data.number)}</strong>.${data.paymentMethod ? ` Pagamento realizado via <strong>${esc(data.paymentMethod)}</strong>.` : ""}
  </div>
  <div class="servico-box">
    <div class="servico-titulo">SERVICO(S) REALIZADO(S)</div>
    ${itemsHtml}
    ${data.partsAmount > 0 ? `<p style="margin-top:10px;"><strong>Pecas/Componentes:</strong> ${formatMoney(data.partsAmount)}</p>` : ""}
    ${data.discount > 0 ? `<p style="margin-top:5px;color:#28a745;"><strong>Desconto:</strong> -${formatMoney(data.discount)}</p>` : ""}
    <p style="margin-top:10px;">Equipamento: <strong>${esc(data.deviceType ?? "Nao informado")}${data.deviceModel ? " - " + esc(data.deviceModel) : ""}</strong></p>
  </div>
  <div class="garantia-box">
    <div class="garantia-titulo">GARANTIA DO SERVICO</div>
    <p><strong>Prazo de Garantia:</strong> ${data.warrantyMonths} meses</p>
    <p><strong>Valida ate:</strong> ${formatDate(warrantyEndDate)}</p>
    <p style="margin-top:10px;font-size:9pt;">A garantia cobre defeitos relacionados ao servico realizado. Nao cobre danos causados por mau uso, quedas, contato com liquidos ou intervencao de terceiros.</p>
  </div>
  <div class="signature">
    <p style="font-size:11pt;color:#2e7d32;font-weight:bold;margin-bottom:5px;font-style:italic;">~ Assinado eletronicamente ~</p>
    <div class="sig-line">Assinatura do Prestador de Servico</div>
    <p style="font-size:10pt;color:#666;margin-top:10px;">${esc(data.tenantName)}<br/>${data.tenantCnpj ? `CNPJ: ${esc(data.tenantCnpj)}` : ""}</p>
  </div>
  <div class="footer">Documento gerado em ${formatDateTime(new Date())} - OS: ${esc(data.number)} - SEM VALOR FISCAL</div>
</body></html>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Quote
// ────────────────────────────────────────────────────────────────────────────

export function buildQuoteHtml(data: QuotePdfData): string {
  const cnpjFmt = data.tenantCnpj ? ` - CNPJ: ${esc(data.tenantCnpj)}` : "";
  const diff = data.newTotal - data.previousTotal;
  const diffFormatted = (diff > 0 ? "+" : "") + formatMoney(diff);

  const itemsHtml = data.items.length > 0
    ? `<table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <tr style="background:#e5e7eb;"><th style="padding:6px;text-align:left;border:1px solid #d1d5db;">Servico</th><th style="padding:6px;text-align:center;width:50px;border:1px solid #d1d5db;">Qtd</th><th style="padding:6px;text-align:right;width:100px;border:1px solid #d1d5db;">Valor</th></tr>
        ${data.items.map((item) => `<tr><td style="padding:6px;border:1px solid #d1d5db;">${esc(item.description)}</td><td style="padding:6px;text-align:center;border:1px solid #d1d5db;">${item.quantity}</td><td style="padding:6px;text-align:right;border:1px solid #d1d5db;">${formatMoney(item.total)}</td></tr>`).join("")}
       </table>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Orcamento Adicional - OS ${esc(data.number)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11pt; margin: 20px; }
  .header { border-bottom: 3px solid #9333ea; padding-bottom: 15px; margin-bottom: 20px; }
  .title { text-align: center; font-size: 18pt; font-weight: bold; margin: 20px 0; color: #9333ea; background: #f3e8ff; padding: 15px; border-radius: 8px; }
  .info-box { background: #f5f5f5; border-left: 4px solid #9333ea; padding: 15px; margin: 15px 0; }
  .info-row { margin: 8px 0; }
  .label { font-weight: bold; color: #555; }
  .servicos-box { border: 2px solid #6b7280; border-radius: 8px; padding: 15px; margin: 15px 0; background: #f9fafb; }
  .servicos-titulo { font-size: 12pt; font-weight: bold; color: #374151; margin-bottom: 8px; }
  .servicos-novos { border: 2px solid #22c55e; border-radius: 8px; padding: 15px; margin: 15px 0; background: #f0fdf4; }
  .servicos-novos-titulo { font-size: 12pt; font-weight: bold; color: #16a34a; margin-bottom: 8px; }
  .valores-box { border: 2px solid #9333ea; border-radius: 8px; padding: 15px; margin: 20px 0; background: #faf5ff; }
  .valores-titulo { font-size: 14pt; font-weight: bold; color: #9333ea; margin-bottom: 10px; }
  .text { text-align: justify; line-height: 1.8; margin: 20px 0; }
  .signature { margin-top: 60px; text-align: center; }
  .sig-line { border-top: 2px solid #000; width: 400px; margin: 0 auto; padding-top: 5px; font-weight: bold; }
  .footer { text-align: center; font-size: 8pt; color: #999; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 10px; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #9333ea; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
  @media print { .print-btn { display: none; } @page { margin: 15mm; } }
</style></head><body>
  <button class="print-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
  <div class="header">
    <div style="font-size:11pt;font-weight:bold;color:#9333ea;">${esc(data.tenantName)}${cnpjFmt}</div>
    <div style="font-size:9pt;color:#666;">Assistencia Tecnica Especializada</div>
    ${data.tenantPhone ? `<div style="font-size:9pt;color:#666;">${esc(data.tenantPhone)}</div>` : ""}
  </div>
  <div class="title">ORCAMENTO ADICIONAL</div>
  <div class="info-box">
    <div class="info-row"><span class="label">Ordem de Servico:</span> ${esc(data.number)}</div>
    <div class="info-row"><span class="label">Data:</span> ${formatDateTime(new Date())}</div>
    <div class="info-row"><span class="label">Cliente:</span> ${esc(data.customerName)}</div>
    ${data.customerCpf ? `<div class="info-row"><span class="label">CPF:</span> ${esc(data.customerCpf)}</div>` : ""}
    <div class="info-row"><span class="label">Equipamento:</span> ${esc(data.deviceType ?? "")} ${esc(data.deviceModel ?? "")}</div>
  </div>
  <div class="servicos-box">
    <div class="servicos-titulo">SERVICOS JA APROVADOS (Orcamento Original)</div>
    ${itemsHtml}
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid #d1d5db;">
      <strong>Valor do Orcamento Original: ${formatMoney(data.previousTotal)}</strong>
    </div>
  </div>
  <div class="servicos-novos">
    <div class="servicos-novos-titulo">SERVICOS ADICIONAIS (Novos)</div>
    <div style="margin-top:8px;"><span class="label">Motivo da Alteracao:</span><p style="margin-top:5px;">${esc(data.reason)}</p></div>
    ${data.additionalServices ? `<div style="margin-top:12px;"><span class="label">Descricao dos Servicos Adicionais:</span><p style="margin-top:5px;">${esc(data.additionalServices)}</p></div>` : ""}
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid #bbf7d0;">
      <strong style="color:#16a34a;">Acrescimo: ${diffFormatted}</strong>
    </div>
  </div>
  <div class="valores-box">
    <div class="valores-titulo">RESUMO FINANCEIRO</div>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:10px;width:50%;"><div style="font-size:10pt;color:#666;">Valor Original</div><div style="font-size:16pt;font-weight:bold;">${formatMoney(data.previousTotal)}</div></td>
        <td style="padding:10px;width:50%;text-align:right;"><div style="font-size:10pt;color:#666;">Novo Valor Total</div><div style="font-size:16pt;font-weight:bold;color:#9333ea;">${formatMoney(data.newTotal)}</div></td>
      </tr>
    </table>
    <div style="text-align:center;margin-top:15px;padding-top:15px;border-top:2px solid #e9d5ff;">
      <div style="font-size:10pt;color:#666;">Diferenca a Pagar</div>
      <div style="font-size:18pt;font-weight:bold;color:${diff > 0 ? "#dc2626" : "#16a34a"};">${diffFormatted}</div>
    </div>
  </div>
  <div class="text">
    <p>Eu, <strong>${esc(data.customerName)}</strong>, portador(a) do CPF <strong>${esc(data.customerCpf ?? "")}</strong>, <strong>APROVO</strong> a realizacao dos servicos adicionais descritos acima, referentes a Ordem de Servico <strong>${esc(data.number)}</strong>.</p>
    <p>Declaro estar ciente do novo valor total do servico e autorizo a ${esc(data.tenantName)} a prosseguir com os reparos conforme descrito neste documento.</p>
  </div>
  <div class="signature">
    <div class="sig-line">Assinatura do Cliente</div>
    <p style="font-size:9pt;color:#666;margin-top:5px;">${esc(data.customerName)}<br/>CPF: ${esc(data.customerCpf ?? "")}</p>
  </div>
  <div class="footer">Documento gerado em ${formatDateTime(new Date())} - OS: ${esc(data.number)}</div>
</body></html>`;
}
