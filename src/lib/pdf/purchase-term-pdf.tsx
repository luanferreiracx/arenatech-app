/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export interface PurchaseTermPdfData {
  purchase: {
    id: string;
    code?: string | null;
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
    doc: string;
    phone: string;
    address: string;
  };
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
const RED_BG = "#fef2f2";
const RED_BORDER = "#f5c6cb";
const RED_TEXT = "#991b1b";
const BLUE_BG = "#eff6ff";
const BLUE_BORDER = "#bfdbfe";
const BLUE_TEXT = "#1e40af";

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
  docNumber: { fontSize: 11, fontFamily: "Helvetica-Bold", color: GOLD, letterSpacing: 0.3 },
  docDate: { fontSize: 7.5, color: LABEL },
  headerDivider: { borderTopWidth: 2, borderTopColor: GOLD, marginTop: 6, marginBottom: 10 },

  title: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: SOFT_BG,
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
  },

  infoTable: { marginBottom: 10 },
  infoRow: { flexDirection: "row", paddingVertical: 3 },
  infoCellLabel: {
    width: 70,
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
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 10,
    marginBottom: 6,
    letterSpacing: 0.3,
  },

  itemsTable: { marginBottom: 10 },
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
  itemsCell: { paddingVertical: 5, paddingHorizontal: 6, fontSize: 9, borderWidth: 1, borderColor: BORDER },

  declaracao: {
    borderWidth: 1,
    borderColor: RED_BORDER,
    backgroundColor: RED_BG,
    padding: 10,
    borderRadius: 4,
    marginVertical: 8,
  },
  declaracaoTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: RED_TEXT, marginBottom: 5, letterSpacing: 0.3 },
  declaracaoText: { fontSize: 8.5, marginBottom: 4 },
  declaracaoList: { marginLeft: 12, marginTop: 4 },
  declaracaoListItem: { fontSize: 8.5, marginBottom: 2 },
  declaracaoInfo: { borderColor: BLUE_BORDER, backgroundColor: BLUE_BG },
  declaracaoInfoTitle: { color: BLUE_TEXT },

  resumo: {
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 8,
    fontSize: 9,
    marginVertical: 8,
    flexDirection: "row",
    gap: 16,
  },
  resumoItem: { },
  resumoLabel: { fontSize: 7, color: LABEL, textTransform: "uppercase", fontFamily: "Helvetica-Bold", letterSpacing: 0.3 },
  resumoValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: TEXT, marginTop: 1 },

  assinaturaWrapper: { marginTop: 30, alignItems: "center" },
  assinaturaLinha: { borderTopWidth: 1, borderTopColor: "#333", paddingTop: 4, width: 280, alignItems: "center", marginTop: 40 },
  assinaturaNome: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  assinaturaCpf: { fontSize: 7.5, color: MUTED, marginTop: 2 },

  footer: {
    textAlign: "center",
    fontSize: 7.5,
    color: "#999",
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
});

const fmtBRL = (v: unknown) =>
  "R$ " +
  Number(v ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDateBr = (d: Date) => new Date(d).toLocaleDateString("pt-BR");
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
  REFURBISHED: "Recondicionado",
  DEFECTIVE: "Defeituoso",
};

export function PurchaseTermPdfDocument({ purchase, seller, store }: PurchaseTermPdfData) {
  const description = [purchase.brand, purchase.model].filter(Boolean).join(" ") || "Aparelho";
  const conditionLabel = CONDITION_LABELS[purchase.condition] ?? purchase.condition;
  const docCode = purchase.code ?? purchase.id.slice(0, 8).toUpperCase();

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
            <Text style={styles.docLabel}>Compra</Text>
            <Text style={styles.docNumber}>{docCode}</Text>
            <Text style={styles.docDate}>{fmtDateBr(purchase.purchaseDate)}</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />

        <Text style={styles.title}>Termo de Responsabilidade</Text>

        <View style={styles.infoTable}>
          <View style={styles.infoRow}>
            <Text style={styles.infoCellLabel}>Vendedor</Text>
            <Text style={[styles.infoCellValue, { fontFamily: "Helvetica-Bold" }]}>{seller.name || "-"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoCellLabel}>Doc.</Text>
            <Text style={styles.infoCellValue}>{seller.doc || "-"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoCellLabel}>Telefone</Text>
            <Text style={styles.infoCellValue}>{seller.phone || "-"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoCellLabel}>Endereco</Text>
            <Text style={styles.infoCellValue}>{seller.address || "-"}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Aparelho(s) Adquirido(s)</Text>
        <View style={styles.itemsTable}>
          <View style={styles.itemsHeaderRow}>
            <Text style={[styles.itemsHeader, { flex: 3 }]}>Aparelho</Text>
            <Text style={[styles.itemsHeader, { flex: 1.5 }]}>IMEI / Serie</Text>
            <Text style={[styles.itemsHeader, { width: 60 }]}>Condicao</Text>
            <Text style={[styles.itemsHeader, { width: 50, textAlign: "center" }]}>Bateria</Text>
            <Text style={[styles.itemsHeader, { width: 70, textAlign: "right" }]}>Valor</Text>
          </View>
          <View style={styles.itemsRow}>
            <Text style={[styles.itemsCell, { flex: 3, fontFamily: "Helvetica-Bold" }]}>{description}</Text>
            <Text style={[styles.itemsCell, { flex: 1.5 }]}>
              {purchase.imei
                ? purchase.imei + (purchase.serial ? `\nS/N: ${purchase.serial}` : "")
                : purchase.serial
                  ? `S/N: ${purchase.serial}`
                  : "-"}
            </Text>
            <Text style={[styles.itemsCell, { width: 60 }]}>{conditionLabel}</Text>
            <Text style={[styles.itemsCell, { width: 50, textAlign: "center" }]}>
              {purchase.batteryHealth != null ? `${purchase.batteryHealth}%` : "-"}
            </Text>
            <Text style={[styles.itemsCell, { width: 70, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
              {fmtBRL(purchase.purchasePrice)}
            </Text>
          </View>
        </View>

        <View style={styles.declaracao}>
          <Text style={styles.declaracaoTitle}>DECLARACAO DE PROPRIEDADE E PROCEDENCIA</Text>
          <Text style={styles.declaracaoText}>
            Eu, <Text style={{ fontFamily: "Helvetica-Bold" }}>{seller.name || "vendedor"}</Text>
            {seller.doc ? `, portador(a) do ${seller.doc}` : ""}, DECLARO sob as penas da lei que:
          </Text>
          <View style={styles.declaracaoList}>
            <Text style={styles.declaracaoListItem}>
              • O(s) aparelho(s) acima descrito(s) e(sao) de minha propriedade legitima;
            </Text>
            <Text style={styles.declaracaoListItem}>
              • O(s) aparelho(s) NAO e(sao) produto de furto, roubo ou qualquer outro crime;
            </Text>
            <Text style={styles.declaracaoListItem}>
              • O(s) aparelho(s) NAO possui(em) restricoes de uso, bloqueios de operadora,
              ou impedimentos legais;
            </Text>
            <Text style={styles.declaracaoListItem}>
              • O(s) aparelho(s) NAO esta(ao) vinculado(s) a contratos de financiamento em
              aberto;
            </Text>
            <Text style={styles.declaracaoListItem}>
              • Todas as informacoes prestadas sao verdadeiras e podem ser verificadas;
            </Text>
            <Text style={styles.declaracaoListItem}>
              • Estou ciente de que a falsidade das informacoes constitui crime de
              estelionato (Art. 171 do Codigo Penal) e receptacao (Art. 180 do Codigo
              Penal).
            </Text>
          </View>
        </View>

        <View style={[styles.declaracao, styles.declaracaoInfo]}>
          <Text style={[styles.declaracaoTitle, styles.declaracaoInfoTitle]}>
            AUTORIZACAO E CIENCIA
          </Text>
          <Text style={styles.declaracaoText}>
            Autorizo a empresa <Text style={{ fontFamily: "Helvetica-Bold" }}>{store.name}</Text> a:
          </Text>
          <View style={styles.declaracaoList}>
            <Text style={styles.declaracaoListItem}>
              • Verificar a procedencia do(s) aparelho(s) junto aos orgaos competentes;
            </Text>
            <Text style={styles.declaracaoListItem}>
              • Registrar o(s) IMEI(s) em sistema proprio para controle de estoque;
            </Text>
            <Text style={styles.declaracaoListItem}>
              • Recusar a transacao caso seja identificada qualquer irregularidade;
            </Text>
            <Text style={styles.declaracaoListItem}>
              • Comunicar as autoridades competentes em caso de suspeita de ilicitude.
            </Text>
          </View>
          <Text style={[styles.declaracaoText, { marginTop: 4 }]}>
            Estou ciente de que, em caso de irregularidade, respondere civil e
            criminalmente pelos danos causados.
          </Text>
        </View>

        <View style={styles.resumo}>
          <View style={styles.resumoItem}>
            <Text style={styles.resumoLabel}>Tipo</Text>
            <Text style={styles.resumoValue}>Compra de Aparelho</Text>
          </View>
          <View style={styles.resumoItem}>
            <Text style={styles.resumoLabel}>Valor Total</Text>
            <Text style={[styles.resumoValue, { color: GOLD }]}>
              {fmtBRL(purchase.purchasePrice)}
            </Text>
          </View>
          <View style={styles.resumoItem}>
            <Text style={styles.resumoLabel}>Data</Text>
            <Text style={styles.resumoValue}>{fmtDateTimeBr(purchase.purchaseDate)}</Text>
          </View>
        </View>

        {purchase.notes && (
          <View wrap={false} style={{ marginTop: 8 }}>
            <Text style={[styles.sectionTitle, { backgroundColor: SOFT_BG, color: TEXT }]}>
              Observacoes
            </Text>
            <Text
              style={{
                fontSize: 9,
                padding: 6,
                backgroundColor: SOFT_BG,
                borderWidth: 1,
                borderColor: BORDER,
              }}
            >
              {purchase.notes}
            </Text>
          </View>
        )}

        <View style={styles.assinaturaWrapper} wrap={false}>
          <View style={styles.assinaturaLinha}>
            <Text style={styles.assinaturaNome}>
              {seller.name || "_______________________"}
            </Text>
            {seller.doc && <Text style={styles.assinaturaCpf}>{seller.doc}</Text>}
          </View>
        </View>

        <Text style={styles.footer}>
          Documento gerado em {new Date().toLocaleDateString("pt-BR")} as{" "}
          {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} |
          Este documento deve ser guardado como comprovante da transacao
        </Text>
      </Page>
    </Document>
  );
}
