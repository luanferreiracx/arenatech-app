/* eslint-disable jsx-a11y/alt-text */
// @react-pdf/renderer usa Image proprio (nao <img>) — sem alt.
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

/**
 * PDF de orcamento adicional (revisao de orcamento da OS).
 *
 * Paridade Laravel `OrdemServicoPdfController::gerarPdfOrcamento` /
 * `gerarHtmlOrcamento`. Mostra valores anteriores vs novos lado-a-lado,
 * com motivo, snapshots de itens e bloco de aprovacao/rejeicao.
 *
 * Antes, a rota `/api/service-orders/[id]/quote-pdf` retornava HTML puro
 * e o WhatsApp enviava o PDF da OS principal — cliente nao via comparacao
 * nem motivo no anexo. Agora gera PDF binario com paridade visual.
 */

export interface QuoteSnapshotItem {
  description: string;
  quantity: number;
  total: number; // centavos
}

export interface ServiceOrderQuotePdfData {
  store: { name: string; phone: string; logoUrl: string | null };
  order: {
    number: string;
    deviceType: string | null;
    deviceModel: string | null;
    imei: string | null;
  };
  customer: { name: string; document: string | null; documentLabel: string | null; phone: string | null } | null;
  quote: {
    reason: string;
    additionalServices: string | null;
    status: "pending" | "approved" | "rejected";
    createdAt: Date;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    approvalLink: string;
    previousServiceAmount: number; // reais
    previousPartsAmount: number;
    previousDiscount: number;
    previousTotal: number;
    newServiceAmount: number;
    newPartsAmount: number;
    newDiscount: number;
    newTotal: number;
    previousItems: QuoteSnapshotItem[];
    newItems: QuoteSnapshotItem[];
  };
  approvalLinkUrl: string;
}

const PURPLE = "#6f42c1";
const PURPLE_LIGHT = "#f3e8ff";
const GRAY_BG = "#f8f9fa";
const GRAY_BORDER = "#dee2e6";
const YELLOW_BG = "#fff3cd";
const YELLOW_BORDER = "#ffc107";
const GREEN_BG = "#d4edda";
const GREEN_BORDER = "#28a745";
const GREEN_DARK = "#155724";
const RED_BG = "#f8d7da";
const RED_BORDER = "#dc3545";
const RED_DARK = "#721c24";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#333" },
  header: { borderBottomWidth: 3, borderBottomColor: PURPLE, paddingBottom: 8, marginBottom: 12, alignItems: "center" },
  logo: { width: 80, height: 40, objectFit: "contain", marginBottom: 4 },
  storeName: { fontSize: 14, color: PURPLE, fontFamily: "Helvetica-Bold" },
  storeMeta: { fontSize: 9, color: "#666", marginTop: 2 },
  titleOs: { fontSize: 11, color: "#555", fontFamily: "Helvetica-Bold", marginTop: 4 },
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 9, color: PURPLE, fontFamily: "Helvetica-Bold", borderBottomWidth: 1, borderBottomColor: PURPLE, paddingBottom: 2, marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  label: { color: "#666", fontSize: 8 },
  value: { fontFamily: "Helvetica-Bold" },
  reasonBox: { backgroundColor: YELLOW_BG, borderWidth: 1, borderColor: YELLOW_BORDER, borderRadius: 4, padding: 6, marginBottom: 6 },
  newBox: { backgroundColor: YELLOW_BG, borderWidth: 2, borderColor: YELLOW_BORDER, borderRadius: 6, padding: 8 },
  previousBox: { backgroundColor: GRAY_BG, borderWidth: 1, borderColor: GRAY_BORDER, borderRadius: 6, padding: 8 },
  itemsTable: { marginTop: 4, marginBottom: 4 },
  itemsHeader: { flexDirection: "row", backgroundColor: PURPLE, color: "white", paddingVertical: 3, paddingHorizontal: 4 },
  itemsHeaderCell: { fontSize: 8, color: "white", fontFamily: "Helvetica-Bold" },
  itemsRow: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: "#eee" },
  itemsCell: { fontSize: 8 },
  colItem: { flex: 3 },
  colQty: { width: 30, textAlign: "center" },
  colVal: { width: 70, textAlign: "right" },
  comparison: { flexDirection: "row", gap: 6, marginTop: 8 },
  comparisonCol: { flex: 1, padding: 6, borderRadius: 4 },
  comparisonColPrevious: { backgroundColor: GRAY_BG, borderWidth: 1, borderColor: GRAY_BORDER },
  comparisonColNew: { backgroundColor: PURPLE_LIGHT, borderWidth: 1, borderColor: PURPLE },
  comparisonTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  totalNew: { fontSize: 13, color: PURPLE, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 10, padding: 8, backgroundColor: PURPLE_LIGHT, borderRadius: 4 },
  approvedBox: { backgroundColor: GREEN_BG, borderWidth: 2, borderColor: GREEN_BORDER, borderRadius: 6, padding: 10, alignItems: "center", marginTop: 8 },
  approvedTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, color: GREEN_DARK, marginBottom: 4 },
  approvedText: { fontFamily: "Helvetica-Oblique", fontSize: 9, color: GREEN_DARK, textAlign: "center" },
  approvedDate: { fontSize: 8, color: GREEN_DARK, marginTop: 4 },
  rejectedBox: { backgroundColor: RED_BG, borderWidth: 2, borderColor: RED_BORDER, borderRadius: 6, padding: 10, alignItems: "center", marginTop: 8 },
  rejectedTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, color: RED_DARK },
  rejectedDate: { fontSize: 8, color: RED_DARK, marginTop: 4 },
  approvalLinkBox: { backgroundColor: GREEN_BG, borderRadius: 6, padding: 10, alignItems: "center", marginTop: 8 },
  approvalLinkText: { color: GREEN_DARK, fontFamily: "Helvetica-Bold", fontSize: 10 },
  approvalLinkHint: { fontSize: 8, color: "#555", marginTop: 4 },
  footer: { borderTopWidth: 1, borderTopColor: "#ddd", paddingTop: 6, marginTop: 12, fontSize: 7, color: "#999", textAlign: "center" },
});

const fmt = (v: number): string => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCents = (c: number): string => "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: Date | null): string => (d ? new Date(d).toLocaleDateString("pt-BR") : "-");

function renderSnapshotItems(items: QuoteSnapshotItem[]): React.ReactElement | null {
  if (!items.length) return null;
  return (
    <View style={styles.itemsTable}>
      <View style={styles.itemsHeader}>
        <Text style={[styles.itemsHeaderCell, styles.colItem]}>Item</Text>
        <Text style={[styles.itemsHeaderCell, styles.colQty]}>Qtd</Text>
        <Text style={[styles.itemsHeaderCell, styles.colVal]}>Valor</Text>
      </View>
      {items.map((it, i) => (
        <View key={i} style={styles.itemsRow}>
          <Text style={[styles.itemsCell, styles.colItem]}>{it.description}</Text>
          <Text style={[styles.itemsCell, styles.colQty]}>{Math.round(it.quantity)}</Text>
          <Text style={[styles.itemsCell, styles.colVal]}>{fmtCents(it.total)}</Text>
        </View>
      ))}
    </View>
  );
}

export function ServiceOrderQuotePdfDocument({ store, order, customer, quote, approvalLinkUrl }: ServiceOrderQuotePdfData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {store.logoUrl ? <Image src={store.logoUrl} style={styles.logo} /> : null}
          <Text style={styles.storeName}>{store.name}</Text>
          <Text style={styles.titleOs}>ORCAMENTO - OS #{order.number}</Text>
          {store.phone ? <Text style={styles.storeMeta}>{store.phone}</Text> : null}
        </View>

        {/* Cliente */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DADOS DO CLIENTE</Text>
          <View style={styles.row}><Text style={styles.label}>Cliente:</Text><Text style={styles.value}>{customer?.name ?? "-"}</Text></View>
          {customer?.document ? <View style={styles.row}><Text style={styles.label}>{customer.documentLabel ?? "CPF"}:</Text><Text>{customer.document}</Text></View> : null}
          {customer?.phone ? <View style={styles.row}><Text style={styles.label}>Telefone:</Text><Text>{customer.phone}</Text></View> : null}
        </View>

        {/* Equipamento */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EQUIPAMENTO</Text>
          <View style={styles.row}><Text style={styles.label}>Tipo:</Text><Text>{order.deviceType ?? "-"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Modelo:</Text><Text>{order.deviceModel ?? "-"}</Text></View>
          {order.imei ? <View style={styles.row}><Text style={styles.label}>IMEI:</Text><Text>{order.imei}</Text></View> : null}
        </View>

        {/* Orcamento anterior */}
        {quote.previousItems.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ORCAMENTO ANTERIOR (ja autorizado)</Text>
            <View style={styles.previousBox}>
              {renderSnapshotItems(quote.previousItems)}
              <View style={[styles.row, { marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: GRAY_BORDER }]}>
                <Text style={styles.value}>Total anterior:</Text>
                <Text style={styles.value}>{fmt(quote.previousTotal)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Novo orcamento */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOVO ORCAMENTO — AGUARDANDO APROVACAO</Text>
          <View style={styles.newBox}>
            <View style={styles.reasonBox}>
              <Text><Text style={styles.value}>Motivo: </Text>{quote.reason}</Text>
            </View>
            {quote.additionalServices ? (
              <Text style={{ fontSize: 8, marginTop: 2 }}>
                <Text style={styles.value}>Detalhes: </Text>{quote.additionalServices}
              </Text>
            ) : null}
            {renderSnapshotItems(quote.newItems)}

            <View style={styles.comparison}>
              <View style={[styles.comparisonCol, styles.comparisonColPrevious]}>
                <Text style={styles.comparisonTitle}>Valores Anteriores</Text>
                <View style={styles.row}><Text style={styles.label}>Servicos:</Text><Text>{fmt(quote.previousServiceAmount)}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Pecas:</Text><Text>{fmt(quote.previousPartsAmount)}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Desconto:</Text><Text>{fmt(quote.previousDiscount)}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Total:</Text><Text style={styles.value}>{fmt(quote.previousTotal)}</Text></View>
              </View>
              <View style={[styles.comparisonCol, styles.comparisonColNew]}>
                <Text style={styles.comparisonTitle}>Novos Valores</Text>
                <View style={styles.row}><Text style={styles.label}>Servicos:</Text><Text>{fmt(quote.newServiceAmount)}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Pecas:</Text><Text>{fmt(quote.newPartsAmount)}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Desconto:</Text><Text>{fmt(quote.newDiscount)}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Total:</Text><Text style={styles.value}>{fmt(quote.newTotal)}</Text></View>
              </View>
            </View>

            <Text style={styles.totalNew}>NOVO VALOR TOTAL: {fmt(quote.newTotal)}</Text>
          </View>
        </View>

        {/* Status approved/rejected/pending */}
        {quote.status === "approved" ? (
          <View style={styles.approvedBox}>
            <Text style={styles.approvedTitle}>APROVADO</Text>
            <Text style={styles.approvedText}>
              Eu, {customer?.name ?? "cliente"}{customer?.document ? `, portador(a) do ${customer.documentLabel ?? "CPF"} ${customer.document}` : ""},
              APROVO os servicos adicionais descritos acima e autorizo o prosseguimento
              no novo valor total de {fmt(quote.newTotal)}.
            </Text>
            {quote.approvedAt ? <Text style={styles.approvedDate}>Aprovado em: {fmtDate(quote.approvedAt)}</Text> : null}
          </View>
        ) : null}

        {quote.status === "rejected" ? (
          <View style={styles.rejectedBox}>
            <Text style={styles.rejectedTitle}>REJEITADO</Text>
            {quote.rejectedAt ? <Text style={styles.rejectedDate}>Rejeitado em: {fmtDate(quote.rejectedAt)}</Text> : null}
          </View>
        ) : null}

        {quote.status === "pending" ? (
          <View style={styles.approvalLinkBox}>
            <Text style={{ fontSize: 9, marginBottom: 4 }}>Para aprovar ou rejeitar este orcamento, acesse:</Text>
            <Text style={styles.approvalLinkText}>{approvalLinkUrl}</Text>
            <Text style={styles.approvalLinkHint}>Criado em: {fmtDate(quote.createdAt)}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          {store.name} - Orcamento gerado em {new Date().toLocaleDateString("pt-BR")} as {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </Page>
    </Document>
  );
}
