/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export interface SaleWarrantyPdfData {
  sale: {
    number: string;
    saleDate: Date;
    items: Array<{
      description: string;
      imei: string | null;
      serial: string | null;
      condition: string | null;
      warrantyMonths: number | null;
    }>;
  };
  customer: {
    name: string;
    cpf: string | null;
    phone: string | null;
  } | null;
  store: {
    name: string;
    cnpj: string | null;
    phone: string | null;
    address?: string | null;
    logoDataUrl: string | null;
  };
  /** Maior garantia em meses entre os itens — usado para calcular validade maxima. */
  maxWarrantyMonths: number;
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
const GREEN_TEXT = "#15803d";

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
  logo: { width: 45, height: 45, objectFit: "contain", marginRight: 10 },
  storeName: { fontSize: 14, fontFamily: "Helvetica-Bold", letterSpacing: 0.3 },
  storeMeta: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  headerRight: { alignItems: "flex-end", marginLeft: 8 },
  docLabel: { fontSize: 7, color: LABEL, textTransform: "uppercase", letterSpacing: 1 },
  docNumber: { fontSize: 12, fontFamily: "Helvetica-Bold", color: GOLD, letterSpacing: 0.3 },
  docDate: { fontSize: 7.5, color: LABEL },
  headerDivider: { borderTopWidth: 2, borderTopColor: GOLD, marginTop: 6, marginBottom: 10 },

  title: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 14,
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: SOFT_BG,
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
  },

  // Info grid 2 colunas
  infoGrid: { flexDirection: "row", gap: 10, marginBottom: 12 },
  infoCard: {
    flex: 1,
    backgroundColor: SOFT_BG,
    borderRadius: 4,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
  },
  infoCardTitle: {
    fontSize: 7.5,
    color: LABEL,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 5,
    fontFamily: "Helvetica-Bold",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingBottom: 3,
  },
  infoCardName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  infoCardText: { fontSize: 9, marginBottom: 2 },

  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: "#fff",
    backgroundColor: NIGHT,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 8,
    marginBottom: 6,
    letterSpacing: 0.3,
  },

  itemsTable: { marginBottom: 12 },
  itemsHeaderRow: { flexDirection: "row", backgroundColor: SOFT_BG },
  itemsHeader: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    borderWidth: 1,
    borderColor: "#ddd",
    letterSpacing: 0.3,
  },
  itemsRow: { flexDirection: "row" },
  itemsCell: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 9,
    borderWidth: 1,
    borderColor: BORDER,
  },

  validityBox: {
    backgroundColor: GREEN_BG,
    borderWidth: 1,
    borderColor: GREEN_BORDER,
    padding: 10,
    borderRadius: 4,
    marginVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  validityLabel: {
    fontSize: 7.5,
    color: GREEN_TEXT,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    fontFamily: "Helvetica-Bold",
  },
  validityValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: GREEN_TEXT, marginTop: 2 },

  termos: { marginVertical: 10 },
  termosListItem: { fontSize: 9, marginBottom: 5, paddingLeft: 4 },
  termosNumber: { fontFamily: "Helvetica-Bold" },

  // Assinaturas duplas
  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 35 },
  signatureBox: { width: "45%", alignItems: "center" },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#333", paddingTop: 4, width: "100%", alignItems: "center", marginTop: 30 },
  signatureName: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  signatureSub: { fontSize: 7.5, color: MUTED, marginTop: 1 },

  footer: {
    textAlign: "center",
    fontSize: 7.5,
    color: "#999",
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
});

const fmtDateBr = (d: Date) => new Date(d).toLocaleDateString("pt-BR");

const CONDITION_LABELS: Record<string, string> = {
  novo: "Novo",
  NEW: "Novo",
  seminovo: "Seminovo",
  SEMI_NEW: "Seminovo",
  usado: "Usado",
  USED: "Usado",
  vitrine: "Vitrine",
  DISPLAY: "Vitrine",
  REFURBISHED: "Recondicionado",
  DEFECTIVE: "Defeituoso",
};

function formatWarranty(months: number | null): string {
  if (!months) return "-";
  if (months >= 12) {
    const years = Math.floor(months / 12);
    return `${years} ${years === 1 ? "ano" : "anos"}`;
  }
  return `${months} ${months === 1 ? "mes" : "meses"}`;
}

export function SaleWarrantyPdfDocument({
  sale,
  customer,
  store,
  maxWarrantyMonths,
}: SaleWarrantyPdfData) {
  const validityEnd = new Date(sale.saleDate);
  validityEnd.setMonth(validityEnd.getMonth() + maxWarrantyMonths);

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
            <Text style={styles.docDate}>{fmtDateBr(sale.saleDate)}</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />

        <Text style={styles.title}>Termo de Garantia</Text>

        {/* Info grid */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Empresa</Text>
            <Text style={styles.infoCardName}>{store.name}</Text>
            {store.cnpj && <Text style={styles.infoCardText}>CNPJ: {store.cnpj}</Text>}
            {store.address && <Text style={styles.infoCardText}>{store.address}</Text>}
            {store.phone && <Text style={styles.infoCardText}>Tel: {store.phone}</Text>}
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Cliente</Text>
            {customer ? (
              <>
                <Text style={styles.infoCardName}>{customer.name}</Text>
                {customer.cpf && <Text style={styles.infoCardText}>CPF: {customer.cpf}</Text>}
                {customer.phone && <Text style={styles.infoCardText}>Tel: {customer.phone}</Text>}
              </>
            ) : (
              <Text style={[styles.infoCardText, { color: MUTED }]}>
                Cliente nao identificado
              </Text>
            )}
          </View>
        </View>

        {/* Produtos */}
        <Text style={styles.sectionTitle}>Produtos Adquiridos</Text>
        <View style={styles.itemsTable}>
          <View style={styles.itemsHeaderRow}>
            <Text style={[styles.itemsHeader, { flex: 3 }]}>Produto</Text>
            <Text style={[styles.itemsHeader, { flex: 1.4 }]}>IMEI / Serie</Text>
            <Text style={[styles.itemsHeader, { width: 70 }]}>Condicao</Text>
            <Text style={[styles.itemsHeader, { width: 70, textAlign: "right" }]}>Garantia</Text>
          </View>
          {sale.items.map((it, i) => (
            <View key={i} style={styles.itemsRow} wrap={false}>
              <Text style={[styles.itemsCell, { flex: 3, fontFamily: "Helvetica-Bold" }]}>
                {it.description}
              </Text>
              <Text style={[styles.itemsCell, { flex: 1.4 }]}>
                {[it.imei, it.serial ? `S/N: ${it.serial}` : null]
                  .filter(Boolean)
                  .join("\n") || "-"}
              </Text>
              <Text style={[styles.itemsCell, { width: 70 }]}>
                {it.condition ? CONDITION_LABELS[it.condition] ?? it.condition : "Novo"}
              </Text>
              <Text
                style={[
                  styles.itemsCell,
                  { width: 70, textAlign: "right", fontFamily: "Helvetica-Bold" },
                ]}
              >
                {formatWarranty(it.warrantyMonths)}
              </Text>
            </View>
          ))}
        </View>

        {/* Validade maxima */}
        <View style={styles.validityBox}>
          <View>
            <Text style={styles.validityLabel}>Validade maxima da garantia</Text>
            <Text style={styles.validityValue}>
              {fmtDateBr(sale.saleDate)} a {fmtDateBr(validityEnd)}
            </Text>
          </View>
        </View>

        {/* Termos */}
        <Text style={styles.sectionTitle}>Termos e Condicoes</Text>
        <View style={styles.termos}>
          <Text style={styles.termosListItem}>
            <Text style={styles.termosNumber}>1. Prazo:</Text> a garantia de cada produto
            segue o prazo indicado na tabela acima, contado a partir da data da compra.
          </Text>
          <Text style={styles.termosListItem}>
            <Text style={styles.termosNumber}>2. Cobertura:</Text> a garantia cobre defeitos
            de fabricacao e funcionamento. Nao cobre danos causados por mau uso, quedas,
            contato com liquidos, ou tentativas de reparo por terceiros.
          </Text>
          <Text style={styles.termosListItem}>
            <Text style={styles.termosNumber}>3. Condicoes:</Text> para acionar a garantia,
            o cliente deve apresentar este termo e o produto nas mesmas condicoes em que
            foi adquirido, sem sinais de violacao.
          </Text>
          <Text style={styles.termosListItem}>
            <Text style={styles.termosNumber}>4. Exclusoes:</Text> acessorios, baterias e
            pecas de desgaste natural nao estao cobertos por esta garantia.
          </Text>
          <Text style={styles.termosListItem}>
            <Text style={styles.termosNumber}>5. Procedimento:</Text> em caso de defeito,
            o cliente deve entrar em contato com nossa loja para avaliacao tecnica.
          </Text>
          <Text style={styles.termosListItem}>
            <Text style={styles.termosNumber}>6. Prazo de analise:</Text> a analise tecnica
            sera realizada em ate 30 dias uteis.
          </Text>
          <Text style={styles.termosListItem}>
            <Text style={styles.termosNumber}>7. Produtos seminovos:</Text> produtos nesta
            condicao podem apresentar sinais de uso normal e nao caracterizam defeito.
          </Text>
        </View>

        {/* Assinaturas */}
        <View style={styles.signatureRow} wrap={false}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureName}>{store.name}</Text>
              {store.cnpj && <Text style={styles.signatureSub}>CNPJ: {store.cnpj}</Text>}
            </View>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureName}>{customer?.name ?? "Cliente"}</Text>
              {customer?.cpf && <Text style={styles.signatureSub}>CPF: {customer.cpf}</Text>}
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          Documento gerado em {new Date().toLocaleDateString("pt-BR")} as{" "}
          {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </Page>
    </Document>
  );
}
