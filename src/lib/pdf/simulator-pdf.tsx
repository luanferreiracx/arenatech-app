import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

/**
 * PDF da simulacao de parcelamento (anexado no WhatsApp via HEADER DOCUMENT).
 * Identidade Arena Tech (teal #2ec4b6 + preto-noite). Paridade visual com
 * a rota HTML antiga + os demais PDFs do projeto.
 */

export interface SimulatorPdfData {
  tenantName: string;
  customerName: string;
  valorProduto: number; // reais
  valorEntrada: number;
  valorFinanciar: number;
  debito: { taxa: number; total: number };
  avista: { taxa: number; total: number };
  parcelas: Array<{ n: number; taxa: number; total: number; parcela: number }>;
  generatedAt: string; // dd/mm/yyyy HH:MM (calculado fora — sem Date no render)
}

const C = {
  gold: "#2ec4b6",
  ink: "#1c1a16",
  muted: "#6b6358",
  line: "#e5e0d2",
  cream: "#f7f3e9",
};

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: C.ink },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 3,
    borderBottomColor: C.gold,
    paddingBottom: 12,
    marginBottom: 18,
  },
  brand: { fontSize: 20, fontWeight: "bold", color: C.gold },
  docTitle: { fontSize: 12, color: C.muted, marginTop: 4 },
  saudacao: { fontSize: 12, marginBottom: 14 },
  resumo: {
    backgroundColor: C.cream,
    borderLeftWidth: 4,
    borderLeftColor: C.gold,
    padding: 12,
    marginBottom: 18,
    borderRadius: 4,
  },
  resumoRow: { flexDirection: "row", marginVertical: 2 },
  resumoLabel: { color: C.muted, width: 140 },
  resumoVal: { fontWeight: "bold" },
  h2: {
    fontSize: 11,
    color: C.gold,
    marginTop: 14,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  thead: { flexDirection: "row", backgroundColor: C.ink, paddingVertical: 6, paddingHorizontal: 8 },
  th: { color: C.gold, fontSize: 9, fontWeight: "bold", textTransform: "uppercase" },
  tr: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  cellLabel: { flex: 2 },
  cellNum: { flex: 1, textAlign: "right" },
  destaque: { color: C.gold, fontWeight: "bold" },
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

function fmt(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SimulatorPdf({ data }: { data: SimulatorPdfData }) {
  const temEntrada = data.valorEntrada > 0;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{data.tenantName}</Text>
            <Text style={styles.docTitle}>Simulacao de Parcelamento</Text>
          </View>
        </View>

        <Text style={styles.saudacao}>
          Ola, {data.customerName}! Segue a simulacao solicitada:
        </Text>

        <View style={styles.resumo}>
          {temEntrada ? (
            <>
              <View style={styles.resumoRow}>
                <Text style={styles.resumoLabel}>Valor do produto:</Text>
                <Text style={styles.resumoVal}>{fmt(data.valorProduto)}</Text>
              </View>
              <View style={styles.resumoRow}>
                <Text style={styles.resumoLabel}>Entrada:</Text>
                <Text style={styles.resumoVal}>{fmt(data.valorEntrada)}</Text>
              </View>
              <View style={styles.resumoRow}>
                <Text style={styles.resumoLabel}>Valor a financiar:</Text>
                <Text style={[styles.resumoVal, styles.destaque]}>{fmt(data.valorFinanciar)}</Text>
              </View>
            </>
          ) : (
            <View style={styles.resumoRow}>
              <Text style={styles.resumoLabel}>A vista no PIX:</Text>
              <Text style={[styles.resumoVal, styles.destaque]}>{fmt(data.valorProduto)}</Text>
            </View>
          )}
        </View>

        <Text style={styles.h2}>Debito</Text>
        <View style={styles.thead}>
          <Text style={[styles.th, styles.cellLabel]}>Forma</Text>
          <Text style={[styles.th, styles.cellNum]}>Total</Text>
        </View>
        <View style={styles.tr}>
          <Text style={styles.cellLabel}>Debito a vista</Text>
          <Text style={[styles.cellNum, styles.destaque]}>{fmt(data.debito.total)}</Text>
        </View>

        <Text style={styles.h2}>Credito</Text>
        <View style={styles.thead}>
          <Text style={[styles.th, styles.cellLabel]}>Parcelas</Text>
          <Text style={[styles.th, styles.cellNum]}>Valor da parcela</Text>
          <Text style={[styles.th, styles.cellNum]}>Total</Text>
        </View>
        <View style={styles.tr}>
          <Text style={styles.cellLabel}>1x a vista</Text>
          <Text style={styles.cellNum}>{fmt(data.avista.total)}</Text>
          <Text style={styles.cellNum}>{fmt(data.avista.total)}</Text>
        </View>
        {data.parcelas.map((p) => (
          <View key={p.n} style={styles.tr}>
            <Text style={styles.cellLabel}>{p.n}x</Text>
            <Text style={styles.cellNum}>{fmt(p.parcela)}</Text>
            <Text style={styles.cellNum}>{fmt(p.total)}</Text>
          </View>
        ))}

        <Text style={styles.footer}>
          Simulacao valida por 1 (um) dia. Valores sujeitos a confirmacao no momento da venda.{"\n"}
          {data.tenantName} - {data.generatedAt}
        </Text>
      </Page>
    </Document>
  );
}
