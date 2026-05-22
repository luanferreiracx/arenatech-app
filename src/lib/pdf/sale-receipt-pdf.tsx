/* @react-pdf/renderer usa <Image> proprio (nao precisa alt). */
/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export interface SaleReceiptPdfData {
  sale: {
    number: string;
    saleDate: Date;
    totalAmount: unknown;
    discountAmount: unknown;
    paidAmount: unknown;
    changeAmount: unknown;
    paymentDetails: unknown;
    observations: string | null;
    items: Array<{
      description: string;
      quantity: number;
      unitPrice: unknown;
      total: unknown;
    }>;
  };
  customer: {
    name: string;
    cpf: string | null;
    phone: string | null;
  } | null;
  store: {
    name: string;
    cnpj: string;
    phone: string;
    logoUrl: string | null;
  };
}

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: "Helvetica", lineHeight: 1.3 },
  header: { borderBottom: 2, borderColor: "#000", paddingBottom: 6, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 60, height: 60, objectFit: "contain" },
  storeName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 8, color: "#666" },
  headerRight: { fontSize: 8, color: "#666", textAlign: "right" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", textAlign: "center", marginVertical: 10 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8, fontSize: 9 },
  section: { marginBottom: 6 },
  sectionTitle: { backgroundColor: "#f3f4f6", padding: 4, fontFamily: "Helvetica-Bold", fontSize: 9, borderLeftWidth: 3, borderLeftColor: "#f97316", marginBottom: 3 },
  row: { flexDirection: "row" },
  col50: { width: "50%", paddingRight: 4 },
  field: { marginBottom: 2 },
  fieldLabel: { fontFamily: "Helvetica-Bold", fontSize: 7, color: "#666" },
  fieldValue: { fontSize: 8, padding: 2, backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb" },
  table: { marginTop: 6, marginBottom: 6 },
  tHeader: { flexDirection: "row", backgroundColor: "#f3f4f6", fontFamily: "Helvetica-Bold" },
  tRow: { flexDirection: "row" },
  tCell: { borderWidth: 1, borderColor: "#ddd", padding: 3, fontSize: 8 },
  totalsBox: { marginTop: 8, borderWidth: 2, borderColor: "#000", padding: 8 },
  total: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right", marginTop: 8, paddingTop: 8, borderTopWidth: 2, borderTopColor: "#000" },
  assinatura: { borderTopWidth: 2, borderTopColor: "#000", paddingTop: 8, marginTop: 28, textAlign: "center" },
  footer: { textAlign: "center", marginTop: 16, fontSize: 8, color: "#666" },
  semValorFiscal: { textAlign: "center", marginTop: 6, fontSize: 8, color: "#999", fontStyle: "italic" },
});

const fmtBRL = (v: unknown) => "R$ " + Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateTime = (d: Date) => {
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

export function SaleReceiptPdfDocument({ sale, customer, store }: SaleReceiptPdfData) {
  const paymentList = Array.isArray(sale.paymentDetails)
    ? (sale.paymentDetails as Array<{ method: string; amount: number; installments?: number }>)
    : [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {store.logoUrl && <Image src={store.logoUrl} style={styles.logo} />}
            <View>
              <Text style={styles.storeName}>{store.name}</Text>
              <Text style={styles.subtitle}>Assistencia Tecnica Especializada</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {store.cnpj && <Text>CNPJ: {store.cnpj}</Text>}
            {store.phone && <Text>Tel: {store.phone}</Text>}
          </View>
        </View>

        <Text style={styles.title}>RECIBO DE VENDA</Text>

        <View style={styles.meta}>
          <Text>Venda #{sale.number}</Text>
          <Text>Data: {fmtDateTime(sale.saleDate)}</Text>
        </View>

        {customer && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DADOS DO CLIENTE</Text>
            <View style={styles.row}>
              <View style={styles.col50}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Nome:</Text>
                  <Text style={styles.fieldValue}>{customer.name}</Text>
                </View>
              </View>
              <View style={styles.col50}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>CPF / Telefone:</Text>
                  <Text style={styles.fieldValue}>
                    {(customer.cpf ?? "—") + " / " + (customer.phone ?? "—")}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ITENS</Text>
          <View style={styles.table}>
            <View style={styles.tHeader}>
              <Text style={[styles.tCell, { flex: 4 }]}>Descricao</Text>
              <Text style={[styles.tCell, { width: 40, textAlign: "center" }]}>Qtd</Text>
              <Text style={[styles.tCell, { width: 70, textAlign: "right" }]}>Valor Unit.</Text>
              <Text style={[styles.tCell, { width: 70, textAlign: "right" }]}>Subtotal</Text>
            </View>
            {sale.items.map((it, i) => (
              <View key={i} style={styles.tRow}>
                <Text style={[styles.tCell, { flex: 4 }]}>{it.description}</Text>
                <Text style={[styles.tCell, { width: 40, textAlign: "center" }]}>{it.quantity}</Text>
                <Text style={[styles.tCell, { width: 70, textAlign: "right" }]}>{fmtBRL(it.unitPrice)}</Text>
                <Text style={[styles.tCell, { width: 70, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{fmtBRL(it.total)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.totalsBox}>
          {Number(sale.discountAmount) > 0 && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Desconto:</Text>
              <Text style={styles.fieldValue}>{fmtBRL(sale.discountAmount)}</Text>
            </View>
          )}

          {paymentList.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Text style={styles.fieldLabel}>Forma(s) de pagamento:</Text>
              {paymentList.map((p, i) => (
                <Text key={i} style={{ fontSize: 8, marginTop: 2 }}>
                  • {p.method.toUpperCase()}
                  {p.installments && p.installments > 1 ? ` (${p.installments}x)` : ""}:{" "}
                  {fmtBRL((p.amount ?? 0) / 100)}
                </Text>
              ))}
            </View>
          )}

          <Text style={styles.total}>TOTAL: {fmtBRL(sale.totalAmount)}</Text>
          {Number(sale.changeAmount) > 0 && (
            <Text style={{ textAlign: "right", marginTop: 4 }}>
              Troco: {fmtBRL(sale.changeAmount)}
            </Text>
          )}
        </View>

        {sale.observations && (
          <View style={{ marginTop: 8 }} wrap={false}>
            <Text style={styles.sectionTitle}>OBSERVACOES</Text>
            <Text style={styles.fieldValue}>{sale.observations}</Text>
          </View>
        )}

        <View style={styles.assinatura}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>ASSINATURA DO CLIENTE</Text>
          <Text>{customer?.name ?? ""}</Text>
          {customer?.cpf && <Text>CPF: {customer.cpf}</Text>}
        </View>

        <Text style={styles.footer}>
          {store.name} - Documento gerado em {new Date().toLocaleDateString("pt-BR")} {new Date().toLocaleTimeString("pt-BR")}
        </Text>
        <Text style={styles.semValorFiscal}>SEM VALOR FISCAL</Text>
      </Page>
    </Document>
  );
}
