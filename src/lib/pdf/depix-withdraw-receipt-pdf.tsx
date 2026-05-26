/* @react-pdf/renderer usa <Image> proprio (nao precisa alt). */
/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export interface DepixWithdrawReceiptPdfData {
  withdraw: {
    number: string;
    pixKeyTypeLabel: string;
    pixKey: string;
    recipientName: string | null;
    recipientTaxId: string | null;
    notes: string | null;
    requestedAmount: number;
    fee: number | null;
    depositAmount: number | null;
    receivedAmount: number | null;
    depixId: string | null;
    blockchainTxId: string | null;
    updatedAt: Date;
    createdAt: Date;
    userName: string | null;
  };
  store: {
    name: string;
    cnpj: string | null;
    phone: string | null;
    address: string | null;
    logoDataUrl: string | null;
  };
}

// Paleta paridade Laravel saques-depix/pdf/comprovante.blade.php
const GOLD = "#c9a84c";
const TEXT = "#1a1a1a";
const MUTED = "#666";
const LABEL = "#888";
const SOFT_BORDER = "#e5e7eb";
const GREEN = "#16a34a";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 34,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    lineHeight: 1.4,
    color: TEXT,
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  logo: { width: 42, height: 42, objectFit: "contain", marginRight: 8 },
  storeName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: TEXT, letterSpacing: 0.2 },
  storeMeta: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  headerRight: { alignItems: "flex-end", marginLeft: 8 },
  docLabel: { fontSize: 7, color: LABEL, textTransform: "uppercase", letterSpacing: 1 },
  docNumber: { fontSize: 14, fontFamily: "Helvetica-Bold", color: GOLD, letterSpacing: 0.3 },
  docDate: { fontSize: 7.5, color: LABEL },
  headerDivider: { borderTopWidth: 2, borderTopColor: GOLD, marginTop: 6, marginBottom: 10 },
  title: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginVertical: 8,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: LABEL,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 4,
  },
  row: { flexDirection: "row", marginBottom: 3 },
  rowLabel: { width: 110, color: MUTED },
  rowValue: { flex: 1 },
  divider: { borderTopWidth: 1, borderTopColor: SOFT_BORDER, marginVertical: 8 },
  totalRow: {
    flexDirection: "row",
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: SOFT_BORDER,
  },
  totalLabel: { width: 110, fontFamily: "Helvetica-Bold" },
  totalValue: { flex: 1, fontFamily: "Helvetica-Bold", color: GREEN },
  monoSmall: { fontFamily: "Helvetica", fontSize: 8, color: MUTED },
  footer: {
    marginTop: 18,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: SOFT_BORDER,
    textAlign: "center",
    fontSize: 7.5,
    color: MUTED,
  },
});

function fmtMoney(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DepixWithdrawReceiptPdf({
  withdraw,
  store,
}: DepixWithdrawReceiptPdfData) {
  return (
    <Document
      title={`Comprovante Saque ${withdraw.number}`}
      author={store.name}
    >
      <Page size="A5" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {store.logoDataUrl ? (
              <Image src={store.logoDataUrl} style={styles.logo} />
            ) : null}
            <View>
              <Text style={styles.storeName}>{store.name}</Text>
              {store.cnpj ? (
                <Text style={styles.storeMeta}>CNPJ {store.cnpj}</Text>
              ) : null}
              {store.phone ? (
                <Text style={styles.storeMeta}>{store.phone}</Text>
              ) : null}
              {store.address ? (
                <Text style={styles.storeMeta}>{store.address}</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docLabel}>Saque DePix</Text>
            <Text style={styles.docNumber}>#{withdraw.number}</Text>
            <Text style={styles.docDate}>{fmtDate(withdraw.createdAt)}</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />

        <Text style={styles.title}>COMPROVANTE DE TRANSFERENCIA</Text>

        {/* Destinatario */}
        <Text style={styles.sectionTitle}>Destinatario</Text>
        {withdraw.recipientName ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Nome</Text>
            <Text style={styles.rowValue}>{withdraw.recipientName}</Text>
          </View>
        ) : null}
        {withdraw.recipientTaxId ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>CPF/CNPJ</Text>
            <Text style={styles.rowValue}>{withdraw.recipientTaxId}</Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Chave PIX</Text>
          <Text style={styles.rowValue}>
            {withdraw.pixKeyTypeLabel}: {withdraw.pixKey}
          </Text>
        </View>
        {withdraw.notes ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Observacao</Text>
            <Text style={styles.rowValue}>{withdraw.notes}</Text>
          </View>
        ) : null}

        {/* Valores */}
        <Text style={styles.sectionTitle}>Valores</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Valor solicitado</Text>
          <Text style={styles.rowValue}>{fmtMoney(withdraw.requestedAmount)}</Text>
        </View>
        {withdraw.fee != null && withdraw.fee > 0 ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Taxa</Text>
            <Text style={styles.rowValue}>+ {fmtMoney(withdraw.fee)}</Text>
          </View>
        ) : null}
        {withdraw.depositAmount != null ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total enviado</Text>
            <Text style={styles.rowValue}>{fmtMoney(withdraw.depositAmount)}</Text>
          </View>
        ) : null}
        {withdraw.receivedAmount != null ? (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Recebido (PIX)</Text>
            <Text style={styles.totalValue}>{fmtMoney(withdraw.receivedAmount)}</Text>
          </View>
        ) : null}

        {/* Transacao */}
        <Text style={styles.sectionTitle}>Transacao</Text>
        {withdraw.depixId ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>ID DePix</Text>
            <Text style={[styles.rowValue, styles.monoSmall]}>{withdraw.depixId}</Text>
          </View>
        ) : null}
        {withdraw.blockchainTxId ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Blockchain TX</Text>
            <Text style={[styles.rowValue, styles.monoSmall]}>
              {withdraw.blockchainTxId}
            </Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Confirmado em</Text>
          <Text style={styles.rowValue}>{fmtDate(withdraw.updatedAt)}</Text>
        </View>
        {withdraw.userName ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Operador</Text>
            <Text style={styles.rowValue}>{withdraw.userName}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text>Documento gerado em {fmtDate(new Date())}</Text>
          <Text>Comprovante nao fiscal — Saque #{withdraw.number}</Text>
        </View>
      </Page>
    </Document>
  );
}
