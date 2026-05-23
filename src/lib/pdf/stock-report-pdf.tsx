import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ReactElement } from "react";

export interface ReportColumn {
  /** chave usada para indexar a linha (linha[key]) */
  key: string;
  /** rotulo exibido no cabecalho */
  label: string;
  /** alinhamento da coluna; default left */
  align?: "left" | "right" | "center";
  /** largura relativa (flex) */
  width?: number;
}

export interface StockReportPdfProps {
  /** Titulo grande no topo */
  title: string;
  /** Subtitulo opcional (ex: "Periodo 01/05 a 23/05") */
  subtitle?: string;
  /** Nome do tenant — vira pequeno no rodape */
  tenantName?: string;
  /** Colunas da tabela */
  columns: ReportColumn[];
  /** Dados — array de objetos cujas chaves correspondem a `column.key` */
  rows: Array<Record<string, string | number | null | undefined>>;
}

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    padding: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1f2937",
  },
  header: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 8,
  },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#6b7280" },
  generatedAt: { fontSize: 8, color: "#9ca3af", marginTop: 4 },
  table: { borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  cell: { paddingHorizontal: 4 },
  cellHeader: { fontSize: 8, fontWeight: 700, color: "#374151", textTransform: "uppercase" },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    fontSize: 7,
    color: "#9ca3af",
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#e5e7eb",
    paddingTop: 4,
  },
});

export function StockReportPdf({
  title,
  subtitle,
  tenantName,
  columns,
  rows,
}: StockReportPdfProps): ReactElement {
  const now = new Date().toLocaleString("pt-BR");
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          <Text style={styles.generatedAt}>Gerado em {now}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.headerRow} fixed>
            {columns.map((c) => (
              <View
                key={c.key}
                style={[
                  styles.cell,
                  { flex: c.width ?? 1, textAlign: c.align ?? "left" },
                ]}
              >
                <Text style={styles.cellHeader}>{c.label}</Text>
              </View>
            ))}
          </View>
          {rows.length === 0 ? (
            <View style={styles.row}>
              <Text style={{ color: "#9ca3af", fontStyle: "italic", flex: 1 }}>
                Sem dados para o periodo selecionado.
              </Text>
            </View>
          ) : (
            rows.map((row, i) => (
              <View key={i} style={styles.row} wrap={false}>
                {columns.map((c) => {
                  const v = row[c.key];
                  return (
                    <View
                      key={c.key}
                      style={[
                        styles.cell,
                        { flex: c.width ?? 1, textAlign: c.align ?? "left" },
                      ]}
                    >
                      <Text>{v == null ? "-" : String(v)}</Text>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text>{tenantName ?? "Arena Tech"}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Pagina ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
