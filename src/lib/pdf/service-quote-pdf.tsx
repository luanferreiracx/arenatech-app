import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

/**
 * PDF do orcamento avulso de servico (anexado no WhatsApp via HEADER DOCUMENT).
 * Identidade Arena Tech (dourado + preto-noite). Paridade com Laravel
 * ServicoController::gerarPdfOrcamentoServico.
 */

export interface ServiceQuotePdfData {
  storeName: string;
  customerName: string;
  serviceName: string; // tipo de servico
  deviceModel: string;
  priceFormatted: string; // ja formatado "R$ X,XX"
  installments: number; // 1 = sem parcelamento
  installmentValueFormatted: string;
  pixDiscountPercent: number; // 0 = sem desconto
  pixPriceFormatted: string;
  observations: string[];
  generatedAt: string; // dd/mm/yyyy HH:MM (sem Date no render)
}

const C = {
  gold: "#c9a84c",
  ink: "#1c1a16",
  muted: "#6b6358",
  line: "#e5e0d2",
  cream: "#f7f3e9",
};

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: C.ink },
  header: {
    borderBottomWidth: 3,
    borderBottomColor: C.gold,
    paddingBottom: 12,
    marginBottom: 18,
  },
  brand: { fontSize: 20, fontWeight: "bold", color: C.gold },
  docTitle: { fontSize: 12, color: C.muted, marginTop: 4 },
  saudacao: { fontSize: 12, marginBottom: 14 },
  card: {
    backgroundColor: C.cream,
    borderLeftWidth: 4,
    borderLeftColor: C.gold,
    padding: 12,
    marginBottom: 14,
    borderRadius: 4,
  },
  row: { flexDirection: "row", marginVertical: 3 },
  label: { color: C.muted, width: 150 },
  val: { fontWeight: "bold" },
  destaque: { color: C.gold, fontWeight: "bold" },
  h2: {
    fontSize: 11,
    color: C.gold,
    marginTop: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  obs: { fontSize: 9, marginBottom: 3 },
  footer: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
    fontSize: 8,
    color: C.muted,
    textAlign: "center",
  },
});

export function ServiceQuotePdf({ data }: { data: ServiceQuotePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>{data.storeName}</Text>
          <Text style={styles.docTitle}>Orcamento de Servico</Text>
        </View>

        <Text style={styles.saudacao}>
          Ola, {data.customerName}! Segue o orcamento solicitado:
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Servico:</Text>
            <Text style={styles.val}>{data.serviceName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Aparelho:</Text>
            <Text style={styles.val}>{data.deviceModel}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Valor:</Text>
            <Text style={[styles.val, styles.destaque]}>{data.priceFormatted}</Text>
          </View>
          {data.installments > 1 && (
            <View style={styles.row}>
              <Text style={styles.label}>Parcelamento:</Text>
              <Text style={styles.val}>
                ate {data.installments}x de {data.installmentValueFormatted} sem juros
              </Text>
            </View>
          )}
          {data.pixDiscountPercent > 0 && (
            <View style={styles.row}>
              <Text style={styles.label}>A vista (PIX):</Text>
              <Text style={styles.val}>
                {data.pixPriceFormatted} com {data.pixDiscountPercent}% de desconto
              </Text>
            </View>
          )}
        </View>

        {data.observations.length > 0 && (
          <>
            <Text style={styles.h2}>Observacoes</Text>
            {data.observations.map((o, i) => (
              <Text key={i} style={styles.obs}>
                - {o}
              </Text>
            ))}
          </>
        )}

        <Text style={styles.footer}>
          Orcamento valido por 48 horas. Valores sujeitos a confirmacao no momento do servico.{"\n"}
          {data.storeName} - Assistencia Tecnica - {data.generatedAt}
        </Text>
      </Page>
    </Document>
  );
}
