/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export type ApuracaoPdfLine = {
  data: string;
  referencia: string;
  categoria: string;
  escopo: string;
  base: number; // reais
  comissao: number; // reais
};

export type ProviderApuracaoPdfData = {
  store: {
    name: string;
    cnpj: string | null;
    phone: string | null;
    address?: string | null;
    logoDataUrl: string | null;
  };
  providerName: string;
  monthLabel: string; // "06/2026"
  status: string;
  summary: {
    grossCommission: number;
    totalReversals: number;
    totalAllowance: number;
    netAmount: number;
  };
  lines: ApuracaoPdfLine[];
};

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
  summaryValueRed: { color: "#dc2626" },

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
  tdBold: { fontFamily: "Helvetica-Bold" },

  emptyBox: {
    marginTop: 6,
    padding: 10,
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    textAlign: "center",
    color: MUTED,
    fontSize: 8,
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

const fmtBRL = (reais: number) =>
  "R$ " + reais.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDateBr = (s: string) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  if (!d) return s;
  return `${d}/${m}/${y}`;
};

// Larguras das colunas (somam 100)
const COLS = { data: 12, ref: 40, cat: 18, escopo: 10, base: 10, comissao: 10 };

export function ProviderApuracaoPdfDocument({
  store,
  providerName,
  monthLabel,
  status,
  summary,
  lines,
}: ProviderApuracaoPdfData) {
  const now = new Date();
  return (
    <Document>
      <Page size="A4" style={styles.page}>
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
            <Text style={styles.docLabel}>Apuracao de comissao</Text>
            <Text style={styles.docTitle}>{monthLabel}</Text>
            <Text style={styles.docDate}>Status: {status}</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />

        <Text style={styles.title}>Comissao — {providerName}</Text>

        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Comissao bruta</Text>
            <Text style={[styles.summaryValue, styles.summaryValuePrimary]}>
              {fmtBRL(summary.grossCommission)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Estornos</Text>
            <Text style={[styles.summaryValue, styles.summaryValueRed]}>
              -{fmtBRL(summary.totalReversals)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Ajuda de custo</Text>
            <Text style={styles.summaryValue}>+{fmtBRL(summary.totalAllowance)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Liquido a pagar</Text>
            <Text style={[styles.summaryValue, styles.summaryValueGreen]}>
              {fmtBRL(summary.netAmount)}
            </Text>
          </View>
        </View>

        {/* Memory table */}
        {lines.length > 0 ? (
          <View style={styles.table}>
            <View style={styles.thead}>
              <Text style={[styles.th, { width: `${COLS.data}%` }]}>Data</Text>
              <Text style={[styles.th, { width: `${COLS.ref}%` }]}>Referencia</Text>
              <Text style={[styles.th, { width: `${COLS.cat}%` }]}>Categoria</Text>
              <Text style={[styles.th, { width: `${COLS.escopo}%` }]}>Escopo</Text>
              <Text style={[styles.th, styles.tdRight, { width: `${COLS.base}%` }]}>Base</Text>
              <Text style={[styles.th, styles.tdRight, { width: `${COLS.comissao}%` }]}>Comissao</Text>
            </View>
            {lines.map((l, i) => (
              <View key={i} style={i % 2 === 0 ? styles.trow : styles.trowEven} wrap={false}>
                <Text style={[styles.td, { width: `${COLS.data}%` }]}>{fmtDateBr(l.data)}</Text>
                <Text style={[styles.td, { width: `${COLS.ref}%` }]}>{l.referencia}</Text>
                <Text style={[styles.td, { width: `${COLS.cat}%` }]}>{l.categoria}</Text>
                <Text style={[styles.td, { width: `${COLS.escopo}%` }]}>{l.escopo}</Text>
                <Text style={[styles.td, styles.tdRight, { width: `${COLS.base}%` }]}>
                  {fmtBRL(l.base)}
                </Text>
                <Text style={[styles.td, styles.tdRight, styles.tdBold, { width: `${COLS.comissao}%` }]}>
                  {fmtBRL(l.comissao)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <Text>Nenhum lancamento comissionado no periodo.</Text>
          </View>
        )}

        <Text style={styles.footer}>
          Gerado em {now.toLocaleString("pt-BR")} | {store.name}
        </Text>
      </Page>
    </Document>
  );
}
