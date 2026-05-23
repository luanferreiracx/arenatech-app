/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export interface SaleDeliveryPdfData {
  sale: {
    number: string;
    saleDate: Date;
    refundDueAmount?: unknown;
    refundDueMethod?: string | null;
    signedViaAutentique?: boolean;
    deviceItems: Array<{
      description: string;
      imei: string | null;
      serial: string | null;
      condition: string | null;
    }>;
  };
  customer: {
    name: string;
    cpf: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  store: {
    name: string;
    cnpj: string | null;
    phone: string | null;
    address?: string | null;
    logoDataUrl: string | null;
  };
}

const GOLD = "#c9a84c";
const NIGHT = "#1a1a2e";
const TEXT = "#1a1a1a";
const MUTED = "#666";
const LABEL = "#888";
const SOFT_BG = "#fafafa";
const BORDER = "#e5e7eb";
const GREEN_BG = "#f0fdf4";
const GREEN_BORDER = "#bbf7d0";
const GREEN_TEXT = "#166534";
const GREEN_DARK = "#10b981";
const AMBER_BG = "#fef3c7";
const AMBER_BORDER = "#d97706";
const AMBER_TEXT = "#92400e";
const HIGHLIGHT_BG = "#fff3cd";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 34,
    fontSize: 10,
    fontFamily: "Helvetica",
    lineHeight: 1.45,
    color: TEXT,
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  logo: { width: 42, height: 42, objectFit: "contain", marginRight: 10 },
  storeName: { fontSize: 13, fontFamily: "Helvetica-Bold", letterSpacing: 0.3 },
  storeMeta: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  headerRight: { alignItems: "flex-end", marginLeft: 8 },
  docLabel: { fontSize: 7, color: LABEL, textTransform: "uppercase", letterSpacing: 1 },
  docNumber: { fontSize: 11, fontFamily: "Helvetica-Bold", color: GOLD, letterSpacing: 0.3 },
  docDate: { fontSize: 7.5, color: LABEL },
  headerDivider: { borderTopWidth: 2, borderTopColor: GOLD, marginTop: 6, marginBottom: 10 },

  title: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: SOFT_BG,
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
  },

  infoTable: { marginBottom: 8 },
  infoRow: { flexDirection: "row", paddingVertical: 2 },
  infoCellLabel: {
    width: 65,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    paddingHorizontal: 6,
  },
  infoCellValue: { flex: 1, fontSize: 9, color: TEXT, paddingHorizontal: 6 },

  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: "#fff",
    backgroundColor: NIGHT,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: 0.3,
  },

  itemsTable: { marginBottom: 8 },
  itemsHeaderRow: { flexDirection: "row", backgroundColor: SOFT_BG },
  itemsHeader: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    borderWidth: 1,
    borderColor: "#ddd",
    letterSpacing: 0.3,
  },
  itemsRow: { flexDirection: "row" },
  itemsCell: { paddingVertical: 4, paddingHorizontal: 6, fontSize: 9, borderWidth: 1, borderColor: BORDER },
  imeiHighlight: {
    backgroundColor: HIGHLIGHT_BG,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 4,
    paddingVertical: 1,
    fontSize: 8.5,
  },

  declaracao: {
    borderWidth: 1,
    borderColor: GREEN_BORDER,
    backgroundColor: GREEN_BG,
    padding: 8,
    borderRadius: 3,
    marginVertical: 6,
  },
  declaracaoTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: GREEN_TEXT, marginBottom: 3, letterSpacing: 0.3 },
  declaracaoText: { fontSize: 8.5 },

  resumo: {
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 6,
    fontSize: 9,
    marginVertical: 6,
    flexDirection: "row",
    gap: 16,
  },
  resumoLabel: { fontSize: 7, color: LABEL, textTransform: "uppercase", fontFamily: "Helvetica-Bold", letterSpacing: 0.3 },
  resumoValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: TEXT, marginTop: 1 },

  downgradeBox: {
    borderWidth: 1,
    borderColor: AMBER_BORDER,
    backgroundColor: AMBER_BG,
    padding: 8,
    borderRadius: 3,
    marginTop: 8,
  },
  downgradeTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: AMBER_TEXT, marginBottom: 3, letterSpacing: 0.3 },
  downgradeText: { fontSize: 8.5, marginBottom: 3 },

  signatureBoxAutentique: {
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: GREEN_DARK,
    borderRadius: 6,
    backgroundColor: GREEN_BG,
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: 280,
    alignItems: "center",
    alignSelf: "center",
    marginTop: 25,
  },
  signatureAutentique: { fontSize: 8, color: GREEN_DARK, fontStyle: "italic" },
  signatureAutentiqueSmall: { fontSize: 7, color: "#059669", marginTop: 2 },
  signatureLineWrap: {
    width: 280,
    alignSelf: "center",
    marginTop: 35,
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingTop: 4,
    alignItems: "center",
  },
  signatureName: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  signatureCpf: { fontSize: 7.5, color: MUTED, marginTop: 2 },

  footer: {
    textAlign: "center",
    fontSize: 7.5,
    color: "#999",
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 4,
  },
});

const fmtBRL = (v: unknown) =>
  "R$ " +
  Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDateTimeBr = (d: Date) =>
  new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const CONDITION_LABELS: Record<string, string> = {
  NEW: "Novo",
  SEMI_NEW: "Seminovo",
  USED: "Usado",
  DISPLAY: "Vitrine",
  novo: "Novo",
  seminovo: "Seminovo",
  usado: "Usado",
  vitrine: "Vitrine",
};

export function SaleDeliveryPdfDocument({ sale, customer, store }: SaleDeliveryPdfData) {
  const refundDue = Number(sale.refundDueAmount ?? 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
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
            <Text style={styles.docLabel}>Venda</Text>
            <Text style={styles.docNumber}>{sale.number}</Text>
            <Text style={styles.docDate}>{fmtDateTimeBr(sale.saleDate)}</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />

        <Text style={styles.title}>Termo de Entrega e Recebimento</Text>

        {/* Dados do cliente */}
        <View style={styles.infoTable}>
          <View style={styles.infoRow}>
            <Text style={styles.infoCellLabel}>Cliente</Text>
            <Text style={[styles.infoCellValue, { fontFamily: "Helvetica-Bold" }]}>
              {customer?.name ?? "Nao identificado"}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoCellLabel}>CPF</Text>
            <Text style={styles.infoCellValue}>{customer?.cpf ?? "-"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoCellLabel}>Telefone</Text>
            <Text style={styles.infoCellValue}>{customer?.phone ?? "-"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoCellLabel}>Endereco</Text>
            <Text style={styles.infoCellValue}>{customer?.address ?? "-"}</Text>
          </View>
        </View>

        {/* Aparelhos entregues */}
        {sale.deviceItems.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Aparelho(s) Entregue(s)</Text>
            <View style={styles.itemsTable}>
              <View style={styles.itemsHeaderRow}>
                <Text style={[styles.itemsHeader, { flex: 3 }]}>Produto</Text>
                <Text style={[styles.itemsHeader, { flex: 1.5 }]}>IMEI</Text>
                <Text style={[styles.itemsHeader, { flex: 1.5 }]}>N. Serie</Text>
                <Text style={[styles.itemsHeader, { width: 70 }]}>Condicao</Text>
              </View>
              {sale.deviceItems.map((it, i) => (
                <View key={i} style={styles.itemsRow} wrap={false}>
                  <Text style={[styles.itemsCell, { flex: 3, fontFamily: "Helvetica-Bold" }]}>
                    {it.description}
                  </Text>
                  <View style={[styles.itemsCell, { flex: 1.5 }]}>
                    {it.imei ? (
                      <Text style={styles.imeiHighlight}>{it.imei}</Text>
                    ) : (
                      <Text>-</Text>
                    )}
                  </View>
                  <Text style={[styles.itemsCell, { flex: 1.5 }]}>{it.serial ?? "-"}</Text>
                  <Text style={[styles.itemsCell, { width: 70 }]}>
                    {it.condition ? CONDITION_LABELS[it.condition] ?? it.condition : "-"}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Declaracao */}
        <View style={styles.declaracao}>
          <Text style={styles.declaracaoTitle}>DECLARACAO DE RECEBIMENTO</Text>
          <Text style={styles.declaracaoText}>
            Eu, <Text style={{ fontFamily: "Helvetica-Bold" }}>{customer?.name ?? "____________________"}</Text>
            , declaro que recebi o(s) aparelho(s) acima descritos em perfeitas condicoes de
            funcionamento, conforme verificado no momento da entrega. Declaro que estou ciente
            das condicoes de garantia informadas e que fui orientado(a) sobre o uso adequado
            do(s) produto(s).
          </Text>
        </View>

        {/* Resumo */}
        <View style={styles.resumo}>
          <View>
            <Text style={styles.resumoLabel}>Data da entrega</Text>
            <Text style={styles.resumoValue}>{fmtDateTimeBr(sale.saleDate)}</Text>
          </View>
          <View>
            <Text style={styles.resumoLabel}>Venda</Text>
            <Text style={styles.resumoValue}>{sale.number}</Text>
          </View>
        </View>

        {/* Downgrade (quitacao da diferenca) */}
        {refundDue > 0 && (
          <View style={styles.downgradeBox}>
            <Text style={styles.downgradeTitle}>QUITACAO DA DIFERENCA</Text>
            <Text style={styles.downgradeText}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Diferenca devolvida ao cliente: </Text>
              {fmtBRL(refundDue)}
              {sale.refundDueMethod
                ? sale.refundDueMethod === "cash"
                  ? " (em dinheiro do caixa)"
                  : " (via PIX)"
                : ""}
            </Text>
            <Text style={styles.downgradeText}>
              O cliente declara ter recebido o valor acima na data desta operacao, dando{" "}
              <Text style={{ fontFamily: "Helvetica-Bold" }}>quitacao integral</Text> da
              diferenca de avaliacao do(s) aparelho(s) entregue(s).
            </Text>
          </View>
        )}

        {/* Assinatura do cliente */}
        {sale.signedViaAutentique ? (
          <>
            <View style={styles.signatureBoxAutentique}>
              <Text style={styles.signatureAutentique}>~ assinado eletronicamente ~</Text>
              <Text style={styles.signatureAutentiqueSmall}>Assinado via Autentique</Text>
            </View>
            <View style={{ marginTop: 4, alignItems: "center" }}>
              <Text style={styles.signatureName}>{customer?.name ?? "Cliente"}</Text>
              {customer?.cpf && <Text style={styles.signatureCpf}>CPF: {customer.cpf}</Text>}
            </View>
          </>
        ) : (
          <View style={styles.signatureLineWrap}>
            <Text style={styles.signatureName}>{customer?.name ?? "Cliente"}</Text>
            {customer?.cpf && <Text style={styles.signatureCpf}>CPF: {customer.cpf}</Text>}
          </View>
        )}

        <Text style={styles.footer}>
          Documento gerado em {new Date().toLocaleDateString("pt-BR")} as{" "}
          {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} |
          Este documento deve ser guardado como comprovante de entrega
        </Text>
      </Page>
    </Document>
  );
}
