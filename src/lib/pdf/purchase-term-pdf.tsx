/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export interface PurchaseTermPdfData {
  purchase: {
    id: string;
    brand: string | null;
    model: string | null;
    imei: string | null;
    serial: string | null;
    condition: string;
    batteryHealth: number | null;
    purchasePrice: unknown;
    purchaseDate: Date;
    notes: string | null;
    sellerType: string;
  };
  seller: {
    name: string;
    doc: string; // "CPF: 000.000.000-00" ou "CNPJ: 00..."
    phone: string;
    address: string;
  };
  store: {
    name: string;
    cnpj: string;
    phone: string;
    logoUrl: string | null;
  };
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", lineHeight: 1.4 },
  header: { borderBottom: 2, borderColor: "#c9a55c", paddingBottom: 8, marginBottom: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 60, height: 60, objectFit: "contain" },
  storeName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  storeMeta: { fontSize: 8, color: "#666" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "center", marginVertical: 14 },
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#c9a55c", borderBottomWidth: 1, borderBottomColor: "#ddd", paddingBottom: 3, marginBottom: 5 },
  row: { flexDirection: "row", justifyContent: "space-between", marginVertical: 1 },
  label: { fontFamily: "Helvetica-Bold", color: "#555" },
  table: { marginTop: 4, borderWidth: 1, borderColor: "#ddd" },
  tRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#ddd" },
  tRowLast: { flexDirection: "row" },
  tCellLabel: { backgroundColor: "#f8f8f8", padding: 5, fontFamily: "Helvetica-Bold", width: "35%", borderRightWidth: 1, borderRightColor: "#ddd" },
  tCellValue: { padding: 5, flex: 1 },
  declaration: { backgroundColor: "#fffaf0", borderLeftWidth: 4, borderLeftColor: "#c9a55c", padding: 10, marginVertical: 14 },
  declarationP: { textAlign: "justify", marginVertical: 3 },
  signatureBox: { marginTop: 40, alignItems: "center" },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#000", width: "70%", paddingTop: 5, textAlign: "center" },
  footer: { textAlign: "center", marginTop: 24, fontSize: 7, color: "#888" },
});

const fmtBRL = (v: unknown) => "R$ " + Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: Date) => new Date(d).toLocaleDateString("pt-BR");

export function PurchaseTermPdfDocument({ purchase, seller, store }: PurchaseTermPdfData) {
  const rows: Array<[string, string]> = [
    ["Marca", purchase.brand ?? "—"],
    ["Modelo", purchase.model ?? "—"],
    ["IMEI", purchase.imei ?? "—"],
    ["Numero de Serie", purchase.serial ?? "—"],
    ["Condicao", purchase.condition],
  ];
  if (purchase.batteryHealth != null) rows.push(["Saude da Bateria", `${purchase.batteryHealth}%`]);
  rows.push(["Valor Pago", fmtBRL(purchase.purchasePrice)]);
  rows.push(["Data da Compra", fmtDate(purchase.purchaseDate)]);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {store.logoUrl && <Image src={store.logoUrl} style={styles.logo} />}
          <View>
            <Text style={styles.storeName}>{store.name}</Text>
            {store.cnpj && <Text style={styles.storeMeta}>{store.cnpj}</Text>}
            {store.phone && <Text style={styles.storeMeta}>Tel: {store.phone}</Text>}
          </View>
        </View>

        <Text style={styles.title}>TERMO DE RESPONSABILIDADE — COMPRA DE APARELHO</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DADOS DO VENDEDOR</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nome:</Text>
            <Text>{seller.name || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Documento:</Text>
            <Text>{seller.doc || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Telefone:</Text>
            <Text>{seller.phone || "—"}</Text>
          </View>
          {seller.address && (
            <View style={styles.row}>
              <Text style={styles.label}>Endereco:</Text>
              <Text>{seller.address}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Tipo:</Text>
            <Text>{purchase.sellerType === "supplier" ? "Fornecedor (PJ)" : "Pessoa Fisica"}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DADOS DO APARELHO</Text>
          <View style={styles.table}>
            {rows.map(([k, v], i) => (
              <View key={k} style={i === rows.length - 1 ? styles.tRowLast : styles.tRow}>
                <Text style={styles.tCellLabel}>{k}</Text>
                <Text style={styles.tCellValue}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        {purchase.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>OBSERVACOES</Text>
            <Text style={{ padding: 6, backgroundColor: "#f9f9f9" }}>{purchase.notes}</Text>
          </View>
        )}

        <View style={styles.declaration}>
          <Text style={styles.declarationP}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Declaracao: </Text>
            Eu, <Text style={{ fontFamily: "Helvetica-Bold" }}>{seller.name}</Text>, {seller.doc},
            declaro que o aparelho acima descrito e de minha propriedade legitima, livre de quaisquer
            onus, gravames, restricoes judiciais ou impedimentos legais, e nao se trata de produto
            de origem ilicita.
          </Text>
          <Text style={styles.declarationP}>
            Comprometo-me a indenizar a empresa <Text style={{ fontFamily: "Helvetica-Bold" }}>{store.name}</Text> e
            responder integralmente por qualquer prejuizo, perda, danos materiais ou morais decorrentes de
            eventual reivindicacao por terceiros, autoridade publica ou orgao policial.
          </Text>
          <Text style={styles.declarationP}>
            Autorizo, ainda, que a empresa proceda com a venda do aparelho a terceiros apos a transacao,
            transferindo a posse e propriedade.
          </Text>
        </View>

        <View style={styles.signatureBox}>
          <View style={styles.signatureLine}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{seller.name}</Text>
            <Text>{seller.doc}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {store.name} — Documento gerado em {new Date().toLocaleDateString("pt-BR")}{" "}
          {new Date().toLocaleTimeString("pt-BR")}
        </Text>
      </Page>
    </Document>
  );
}
