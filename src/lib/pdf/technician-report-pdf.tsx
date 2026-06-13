/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export interface TechnicianReportItem {
  technicianName: string;
  totalOs: number;
  completed: number;
  cancelled: number;
  serviceValue: number; // centavos
  partsValue: number;
  totalValue: number;
  partsCost: number;
  otherCost: number;
  profit: number;
  ticketMedio: number;
  avgDays: number | null;
}

export interface TechnicianReportTotals {
  totalOs: number;
  completed: number;
  cancelled: number;
  serviceValue: number;
  partsValue: number;
  totalValue: number;
  partsCost: number;
  otherCost: number;
  profit: number;
  ticketMedio: number;
}

export interface TechnicianReportPdfData {
  store: {
    name: string;
    cnpj: string | null;
    phone: string | null;
    address?: string | null;
    logoDataUrl: string | null;
  };
  period: { from: string; to: string };
  technicianName: string | null; // se filtrado por um tecnico especifico
  items: TechnicianReportItem[];
  totals: TechnicianReportTotals;
}

const GOLD = "#2ec4b6";
const NIGHT = "#1a1a2e";
const TEXT = "#1a1a1a";
const MUTED = "#666";
const LABEL = "#888";
const SOFT_BG = "#fafafa";
const BORDER = "#e5e7eb";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 24,
    fontSize: 8.5,
    fontFamily: "Helvetica",
    lineHeight: 1.35,
    color: TEXT,
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  logo: { width: 42, height: 42, objectFit: "contain", marginRight: 10 },
  storeName: { fontSize: 13, fontFamily: "Helvetica-Bold", letterSpacing: 0.3 },
  storeMeta: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  headerRight: { alignItems: "flex-end", marginLeft: 8 },
  docLabel: { fontSize: 7, color: LABEL, textTransform: "uppercase", letterSpacing: 1 },
  docTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: GOLD, letterSpacing: 0.3 },
  docDate: { fontSize: 7.5, color: LABEL },
  headerDivider: { borderTopWidth: 2, borderTopColor: GOLD, marginTop: 6, marginBottom: 10 },

  title: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: SOFT_BG,
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
  },

  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  summaryCard: {
    flex: 1,
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 6,
    borderRadius: 3,
  },
  summaryLabel: {
    fontSize: 7,
    color: LABEL,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.3,
  },
  summaryValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: TEXT, marginTop: 2 },
  summaryValueGreen: { color: "#10b981" },
  summaryValuePrimary: { color: GOLD },

  table: { marginTop: 4 },
  thead: { flexDirection: "row", backgroundColor: NIGHT },
  th: {
    color: "#fff",
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  trow: { flexDirection: "row" },
  trowEven: { flexDirection: "row", backgroundColor: SOFT_BG },
  td: {
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 7.5,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  tdRight: { textAlign: "right" },
  tdCenter: { textAlign: "center" },
  tdBold: { fontFamily: "Helvetica-Bold" },

  totalsRow: {
    flexDirection: "row",
    backgroundColor: GOLD,
    marginTop: 2,
  },
  totalsCell: {
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#fff",
  },

  footer: {
    textAlign: "center",
    fontSize: 7,
    color: "#999",
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 4,
  },
});

const fmtBRL = (cents: number) =>
  "R$ " +
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDateBr = (s: string) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

// Larguras das colunas (somam 100)
const COLS = {
  rank: 4,
  tech: 22,
  totalOs: 6,
  completed: 6,
  cancelled: 6,
  servico: 10,
  pecas: 10,
  total: 11,
  custoP: 8,
  outros: 6,
  lucro: 11,
};

export function TechnicianReportPdfDocument({
  store,
  period,
  technicianName,
  items,
  totals,
}: TechnicianReportPdfData) {
  const now = new Date();
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {store.logoDataUrl && <Image src={store.logoDataUrl} style={styles.logo} />}
            <View>
              <Text style={styles.storeName}>{store.name}</Text>
              <Text style={styles.storeMeta}>
                {[
                  store.cnpj ? `CNPJ: ${store.cnpj}` : null,
                  store.phone ? `Tel: ${store.phone}` : null,
                ]
                  .filter(Boolean)
                  .join(" | ")}
              </Text>
              {store.address && <Text style={styles.storeMeta}>{store.address}</Text>}
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docLabel}>Relatorio</Text>
            <Text style={styles.docTitle}>Por Tecnico</Text>
            <Text style={styles.docDate}>
              {fmtDateBr(period.from)} a {fmtDateBr(period.to)}
            </Text>
          </View>
        </View>
        <View style={styles.headerDivider} />

        <Text style={styles.title}>
          Desempenho dos Tecnicos{technicianName ? ` — ${technicianName}` : ""}
        </Text>

        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total OS</Text>
            <Text style={[styles.summaryValue, styles.summaryValuePrimary]}>{totals.totalOs}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Concluidas</Text>
            <Text style={[styles.summaryValue, styles.summaryValueGreen]}>{totals.completed}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Valor Total</Text>
            <Text style={[styles.summaryValue, styles.summaryValuePrimary]}>{fmtBRL(totals.totalValue)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Ticket Medio</Text>
            <Text style={styles.summaryValue}>{fmtBRL(totals.ticketMedio)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Lucro</Text>
            <Text style={[styles.summaryValue, styles.summaryValueGreen]}>{fmtBRL(totals.profit)}</Text>
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, { width: `${COLS.rank}%` }]}>#</Text>
            <Text style={[styles.th, { width: `${COLS.tech}%` }]}>Tecnico</Text>
            <Text style={[styles.th, styles.tdCenter, { width: `${COLS.totalOs}%` }]}>OS</Text>
            <Text style={[styles.th, styles.tdCenter, { width: `${COLS.completed}%` }]}>Concl.</Text>
            <Text style={[styles.th, styles.tdCenter, { width: `${COLS.cancelled}%` }]}>Canc.</Text>
            <Text style={[styles.th, styles.tdRight, { width: `${COLS.servico}%` }]}>Servico</Text>
            <Text style={[styles.th, styles.tdRight, { width: `${COLS.pecas}%` }]}>Pecas</Text>
            <Text style={[styles.th, styles.tdRight, { width: `${COLS.total}%` }]}>Total</Text>
            <Text style={[styles.th, styles.tdRight, { width: `${COLS.custoP}%` }]}>Custo Pc</Text>
            <Text style={[styles.th, styles.tdRight, { width: `${COLS.outros}%` }]}>Outros</Text>
            <Text style={[styles.th, styles.tdRight, { width: `${COLS.lucro}%` }]}>Lucro</Text>
          </View>
          {items.map((it, i) => (
            <View key={i} style={i % 2 === 0 ? styles.trow : styles.trowEven} wrap={false}>
              <Text style={[styles.td, { width: `${COLS.rank}%` }]}>{i + 1}</Text>
              <Text style={[styles.td, styles.tdBold, { width: `${COLS.tech}%` }]}>
                {it.technicianName}
              </Text>
              <Text style={[styles.td, styles.tdCenter, { width: `${COLS.totalOs}%` }]}>
                {it.totalOs}
              </Text>
              <Text style={[styles.td, styles.tdCenter, { width: `${COLS.completed}%`, color: "#10b981" }]}>
                {it.completed}
              </Text>
              <Text style={[styles.td, styles.tdCenter, { width: `${COLS.cancelled}%`, color: "#dc2626" }]}>
                {it.cancelled}
              </Text>
              <Text style={[styles.td, styles.tdRight, { width: `${COLS.servico}%` }]}>
                {fmtBRL(it.serviceValue)}
              </Text>
              <Text style={[styles.td, styles.tdRight, { width: `${COLS.pecas}%` }]}>
                {fmtBRL(it.partsValue)}
              </Text>
              <Text style={[styles.td, styles.tdRight, styles.tdBold, { width: `${COLS.total}%` }]}>
                {fmtBRL(it.totalValue)}
              </Text>
              <Text style={[styles.td, styles.tdRight, { width: `${COLS.custoP}%` }]}>
                {fmtBRL(it.partsCost)}
              </Text>
              <Text style={[styles.td, styles.tdRight, { width: `${COLS.outros}%` }]}>
                {fmtBRL(it.otherCost)}
              </Text>
              <Text style={[styles.td, styles.tdRight, styles.tdBold, { width: `${COLS.lucro}%`, color: "#10b981" }]}>
                {fmtBRL(it.profit)}
              </Text>
            </View>
          ))}
          {/* Totals row */}
          <View style={styles.totalsRow} wrap={false}>
            <Text style={[styles.totalsCell, { width: `${COLS.rank + COLS.tech}%` }]}>TOTAL</Text>
            <Text style={[styles.totalsCell, styles.tdCenter, { width: `${COLS.totalOs}%` }]}>
              {totals.totalOs}
            </Text>
            <Text style={[styles.totalsCell, styles.tdCenter, { width: `${COLS.completed}%` }]}>
              {totals.completed}
            </Text>
            <Text style={[styles.totalsCell, styles.tdCenter, { width: `${COLS.cancelled}%` }]}>
              {totals.cancelled}
            </Text>
            <Text style={[styles.totalsCell, styles.tdRight, { width: `${COLS.servico}%` }]}>
              {fmtBRL(totals.serviceValue)}
            </Text>
            <Text style={[styles.totalsCell, styles.tdRight, { width: `${COLS.pecas}%` }]}>
              {fmtBRL(totals.partsValue)}
            </Text>
            <Text style={[styles.totalsCell, styles.tdRight, { width: `${COLS.total}%` }]}>
              {fmtBRL(totals.totalValue)}
            </Text>
            <Text style={[styles.totalsCell, styles.tdRight, { width: `${COLS.custoP}%` }]}>
              {fmtBRL(totals.partsCost)}
            </Text>
            <Text style={[styles.totalsCell, styles.tdRight, { width: `${COLS.outros}%` }]}>
              {fmtBRL(totals.otherCost)}
            </Text>
            <Text style={[styles.totalsCell, styles.tdRight, { width: `${COLS.lucro}%` }]}>
              {fmtBRL(totals.profit)}
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Gerado em {now.toLocaleString("pt-BR")} | {store.name}
        </Text>
      </Page>
    </Document>
  );
}
