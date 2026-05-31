/* @react-pdf/renderer usa <Image> proprio (nao precisa alt). */
/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export interface DepixTxReceiptPdfData {
  tx: {
    number: string;
    kind: "DEPOSIT" | "WITHDRAW";
    statusLabel: string;
    grossAmountCents: number;
    feeArenaTechCents: number;
    feePixPayCents: number | null;
    netAmountCents: number | null;
    // Saque
    pixKeyType: string | null;
    pixKey: string | null;
    recipientName: string | null;
    recipientTaxId: string | null;
    withdrawTxId: string | null;
    // Deposito
    depositTxId: string | null;
    depositAddress: string | null;
    pixpayDepixId: string | null;
    createdAt: Date;
    completedAt: Date | null;
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

const GOLD = "#c9a84c";
const TEXT = "#1a1a1a";
const MUTED = "#666";
const LABEL = "#888";
const SOFT_BORDER = "#e5e7eb";
const GREEN = "#16a34a";

const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 28, paddingHorizontal: 34, fontSize: 9.5, fontFamily: "Helvetica", lineHeight: 1.4, color: TEXT },
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
  title: { textAlign: "center", fontSize: 13, fontFamily: "Helvetica-Bold", marginVertical: 8, letterSpacing: 0.5 },
  sectionTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: LABEL, textTransform: "uppercase", letterSpacing: 1, marginTop: 10, marginBottom: 4 },
  row: { flexDirection: "row", marginBottom: 3 },
  rowLabel: { width: 130, color: MUTED },
  rowValue: { flex: 1 },
  totalRow: { flexDirection: "row", marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: SOFT_BORDER },
  totalLabel: { width: 130, fontFamily: "Helvetica-Bold" },
  totalValue: { flex: 1, fontFamily: "Helvetica-Bold", color: GREEN },
  monoSmall: { fontFamily: "Helvetica", fontSize: 8, color: MUTED },
  footer: { marginTop: 18, paddingTop: 8, borderTopWidth: 1, borderTopColor: SOFT_BORDER, textAlign: "center", fontSize: 7.5, color: MUTED },
});

function fmtBRL(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}
function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

export function DepixTxReceiptPdf({ tx, store }: DepixTxReceiptPdfData) {
  const title = tx.kind === "DEPOSIT" ? "COMPROVANTE DE DEPOSITO DEPIX" : "COMPROVANTE DE SAQUE DEPIX";
  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {store.logoDataUrl ? <Image style={styles.logo} src={store.logoDataUrl} /> : null}
            <View>
              <Text style={styles.storeName}>{store.name}</Text>
              {store.cnpj ? <Text style={styles.storeMeta}>CNPJ {store.cnpj}</Text> : null}
              {store.phone ? <Text style={styles.storeMeta}>{store.phone}</Text> : null}
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docLabel}>{tx.kind === "DEPOSIT" ? "Deposito" : "Saque"} DePix</Text>
            <Text style={styles.docNumber}>{tx.number}</Text>
            <Text style={styles.docDate}>{fmtDate(tx.completedAt ?? tx.createdAt)}</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />

        <Text style={styles.title}>{title}</Text>

        <Text style={styles.sectionTitle}>Valores</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{tx.kind === "DEPOSIT" ? "Pago pelo cliente" : "Valor solicitado"}</Text>
          <Text style={styles.rowValue}>{fmtBRL(tx.grossAmountCents)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Taxa Arena Tech</Text>
          <Text style={styles.rowValue}>− {fmtBRL(tx.feeArenaTechCents)}</Text>
        </View>
        {tx.feePixPayCents != null && (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Taxa PixPay</Text>
            <Text style={styles.rowValue}>− {fmtBRL(tx.feePixPayCents)}</Text>
          </View>
        )}
        {tx.netAmountCents != null && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{tx.kind === "DEPOSIT" ? "Voce recebeu" : "Destinatario recebeu"}</Text>
            <Text style={styles.totalValue}>{fmtBRL(tx.netAmountCents)}</Text>
          </View>
        )}

        {tx.kind === "WITHDRAW" && (
          <>
            <Text style={styles.sectionTitle}>Destinatario</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Tipo de chave</Text>
              <Text style={styles.rowValue}>{tx.pixKeyType ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Chave PIX</Text>
              <Text style={[styles.rowValue, styles.monoSmall]}>{tx.pixKey ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>CPF/CNPJ</Text>
              <Text style={styles.rowValue}>{tx.recipientTaxId ?? "—"}</Text>
            </View>
            {tx.recipientName && (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Nome</Text>
                <Text style={styles.rowValue}>{tx.recipientName}</Text>
              </View>
            )}
          </>
        )}

        <Text style={styles.sectionTitle}>Transacao</Text>
        {(tx.depositTxId ?? tx.withdrawTxId) && (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>TXID Liquid</Text>
            <Text style={[styles.rowValue, styles.monoSmall]}>{tx.depositTxId ?? tx.withdrawTxId}</Text>
          </View>
        )}
        {tx.pixpayDepixId && (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>ID PixPay</Text>
            <Text style={[styles.rowValue, styles.monoSmall]}>{tx.pixpayDepixId}</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Status</Text>
          <Text style={styles.rowValue}>{tx.statusLabel}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Solicitado em</Text>
          <Text style={styles.rowValue}>{fmtDate(tx.createdAt)}</Text>
        </View>
        {tx.completedAt && (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Concluido em</Text>
            <Text style={styles.rowValue}>{fmtDate(tx.completedAt)}</Text>
          </View>
        )}
        {tx.userName && (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Operador</Text>
            <Text style={styles.rowValue}>{tx.userName}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text>Documento gerado em {fmtDate(new Date())}</Text>
          <Text>Comprovante nao fiscal — DePix Wallet {tx.number}</Text>
        </View>
      </Page>
    </Document>
  );
}
