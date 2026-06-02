// @react-pdf/renderer usa componentes proprios (Document, Page, View, Image).
// `Image` aqui nao e <img> HTML — nao precisa de `alt`.
/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { CHECKLIST_ITEMS, type ChecklistData } from "@/lib/validators/service-order";

// ────────────────────────────────────────────────────────────────────────────
// Tipos de entrada (subset do schema, evita acoplar Prisma)
// ────────────────────────────────────────────────────────────────────────────
export interface ServiceOrderPdfData {
  order: {
    number: string;
    entryDate: Date;
    deviceType: string | null;
    deviceModel: string | null;
    imei: string | null;
    devicePassword: string | null;
    reportedProblem: string | null;
    entryChecklist: Record<string, boolean | null> | null;
    deviceInfo: Record<string, boolean> | null;
    serviceAmount: unknown;
    partsAmount: unknown;
    discount: unknown;
    totalAmount: unknown;
    paymentMethod: string | null;
    completedDate: Date | null;
    technicianId: string | null;
    items: Array<{
      description: string;
      quantity: unknown;
      unitPrice: unknown;
      total: unknown;
    }>;
  };
  customer: {
    name: string;
    cpf: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  store: {
    name: string;
    cnpj: string;
    phone: string;
    logoUrl: string | null;
  };
  technicianName?: string | null;
  termsOfService?: string | null;
  warrantyPolicy?: string | null;
}

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: "Helvetica", lineHeight: 1.3 },
  header: { borderBottom: 2, borderColor: "#000", paddingBottom: 6, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 60, height: 60, objectFit: "contain" },
  storeName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 8, color: "#666" },
  headerRight: { fontSize: 8, color: "#666", textAlign: "right" },
  osHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  numeroOs: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#f97316" },
  date: { fontSize: 9 },
  section: { marginBottom: 6 },
  sectionTitle: { backgroundColor: "#f3f4f6", padding: 4, fontFamily: "Helvetica-Bold", fontSize: 9, borderLeftWidth: 3, borderLeftColor: "#f97316", marginBottom: 3 },
  row: { flexDirection: "row" },
  col50: { width: "50%", paddingRight: 4 },
  field: { marginBottom: 2 },
  fieldLabel: { fontFamily: "Helvetica-Bold", fontSize: 7, color: "#666" },
  fieldValue: { fontSize: 8, padding: 2, backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb" },
  checklistRow: { flexDirection: "row" },
  checklistCell: { width: "20%", padding: 2, borderWidth: 1, borderColor: "#ddd", fontSize: 7 },
  infoCell: { padding: 3, borderWidth: 1, borderColor: "#ddd", fontSize: 7, backgroundColor: "#fff3e0", flexBasis: "33%", marginRight: 1 },
  table: { marginTop: 6, marginBottom: 6 },
  tHeader: { flexDirection: "row", backgroundColor: "#f3f4f6", fontFamily: "Helvetica-Bold" },
  tRow: { flexDirection: "row" },
  tCell: { borderWidth: 1, borderColor: "#ddd", padding: 3, fontSize: 8 },
  valoresBox: { marginTop: 8, borderWidth: 2, borderColor: "#000", padding: 8 },
  total: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right", marginTop: 8, paddingTop: 8, borderTopWidth: 2, borderTopColor: "#000" },
  assinatura: { borderTopWidth: 2, borderTopColor: "#000", paddingTop: 8, marginTop: 28, textAlign: "center" },
  footer: { textAlign: "center", marginTop: 16, fontSize: 8, color: "#666" },
  termsBlock: { fontSize: 7.5, padding: 4, backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb" },
});

const fmtBRL = (v: unknown) => "R$ " + Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateTime = (d: Date | null) => {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
const fmtCheck = (v: boolean | null | undefined): string => v === true ? "Sim" : v === false ? "Nao" : "Nao Testado";

// As keys do checklist sao camelCase (paridade com o validator/wizard que grava no
// banco). CHECKLIST_ITEMS e a fonte unica da verdade; manter um map snake_case
// hardcoded aqui faria todos os 15 itens lerem `undefined` -> "Nao Testado",
// independente do que o usuario preencheu.
const checklistOrdered = CHECKLIST_ITEMS;

const infoLabels: Record<string, string> = {
  cliente_aparelho_molhou: "Cliente informou que aparelho molhou",
  cliente_nao_usa_fonte_original: "Cliente informou nao usar fonte original",
  cliente_aparelho_sofreu_queda: "Cliente informou que aparelho sofreu queda",
  aparelho_problemas_ocultos: "Aparelho pode ter outros problemas ocultos",
  servico_outra_assistencia_recente: "Realizou servico em outra assistencia recentemente",
  acessorios_chip_devolvidos: "Os acessorios e o chip foram devolvidos ao cliente",
};

export function ServiceOrderPdfDocument({ order, customer, store, technicianName, termsOfService, warrantyPolicy }: ServiceOrderPdfData) {
  const entryChecklist = (order.entryChecklist ?? {}) as ChecklistData;
  const deviceInfo = order.deviceInfo ?? {};
  const activeInfos = Object.entries(infoLabels).filter(([k]) => deviceInfo[k]).map(([, l]) => l);
  const checklistRows: typeof checklistOrdered[] = [];
  for (let i = 0; i < checklistOrdered.length; i += 5) {
    checklistRows.push(checklistOrdered.slice(i, i + 5));
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {store.logoUrl && (
              <Image src={store.logoUrl} style={styles.logo} />
            )}
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

        {/* OS number + date */}
        <View style={styles.osHeader}>
          <Text style={styles.numeroOs}>ORDEM DE SERVICO #{order.number}</Text>
          <Text style={styles.date}>Data: {fmtDateTime(order.entryDate)}</Text>
        </View>

        {/* Cliente */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DADOS DO CLIENTE</Text>
          <View style={styles.row}>
            <View style={styles.col50}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Nome:</Text>
                <Text style={styles.fieldValue}>{customer?.name ?? "-"}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>CPF:</Text>
                <Text style={styles.fieldValue}>{customer?.cpf || "Nao informado"}</Text>
              </View>
            </View>
            <View style={styles.col50}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Telefone:</Text>
                <Text style={styles.fieldValue}>{customer?.phone || "-"}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Email:</Text>
                <Text style={styles.fieldValue}>{customer?.email || "Nao informado"}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Equipamento */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DADOS DO EQUIPAMENTO</Text>
          <View style={styles.row}>
            <View style={styles.col50}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Tipo:</Text>
                <Text style={styles.fieldValue}>{order.deviceType || "-"}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Modelo:</Text>
                <Text style={styles.fieldValue}>{order.deviceModel || "-"}</Text>
              </View>
            </View>
            <View style={styles.col50}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>IMEI:</Text>
                <Text style={styles.fieldValue}>{order.imei || "Nao informado"}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Senha:</Text>
                <Text style={styles.fieldValue}>{order.devicePassword || "Nao informado"}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Problema relatado */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PROBLEMA RELATADO</Text>
          <Text style={styles.fieldValue}>{order.reportedProblem || "-"}</Text>
        </View>

        {/* Info adicionais */}
        {activeInfos.length > 0 && (
          <View style={styles.section}>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {activeInfos.map((info, idx) => (
                <Text key={idx} style={styles.infoCell}>{info}</Text>
              ))}
            </View>
          </View>
        )}

        {/* Checklist */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CHECKLIST DE ENTRADA</Text>
          {checklistRows.map((row, ri) => (
            <View key={ri} style={styles.checklistRow}>
              {row.map((item) => (
                <Text key={item.key} style={styles.checklistCell}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{item.label}: </Text>
                  {fmtCheck(entryChecklist[item.key])}
                </Text>
              ))}
            </View>
          ))}
        </View>

        {/* Valores */}
        <View style={styles.valoresBox}>
          <Text style={styles.sectionTitle}>SERVICOS E VALORES</Text>
          {order.items.length > 0 && (
            <View style={styles.table}>
              <View style={styles.tHeader}>
                <Text style={[styles.tCell, { flex: 3 }]}>Servico</Text>
                <Text style={[styles.tCell, { width: 40, textAlign: "center" }]}>Qtd</Text>
                <Text style={[styles.tCell, { width: 70, textAlign: "right" }]}>Valor Unit.</Text>
                <Text style={[styles.tCell, { width: 70, textAlign: "right" }]}>Subtotal</Text>
              </View>
              {order.items.map((it, i) => (
                <View key={i} style={styles.tRow}>
                  <Text style={[styles.tCell, { flex: 3 }]}>{it.description}</Text>
                  <Text style={[styles.tCell, { width: 40, textAlign: "center" }]}>{Math.round(Number(it.quantity))}</Text>
                  <Text style={[styles.tCell, { width: 70, textAlign: "right" }]}>{fmtBRL(it.unitPrice)}</Text>
                  <Text style={[styles.tCell, { width: 70, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{fmtBRL(it.total)}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.row}>
            <View style={styles.col50}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Subtotal Servicos:</Text>
                <Text style={styles.fieldValue}>{fmtBRL(order.serviceAmount)}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Valor Pecas:</Text>
                <Text style={styles.fieldValue}>{fmtBRL(order.partsAmount)}</Text>
              </View>
              {technicianName && (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Tecnico Responsavel:</Text>
                  <Text style={styles.fieldValue}>{technicianName}</Text>
                </View>
              )}
            </View>
            <View style={styles.col50}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Desconto:</Text>
                <Text style={styles.fieldValue}>{fmtBRL(order.discount)}</Text>
              </View>
              {order.paymentMethod && (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Forma de Pagamento:</Text>
                  <Text style={styles.fieldValue}>{order.paymentMethod}</Text>
                </View>
              )}
              {order.completedDate && (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Conclusao:</Text>
                  <Text style={styles.fieldValue}>{fmtDateTime(order.completedDate)}</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.total}>TOTAL: {fmtBRL(order.totalAmount)}</Text>
        </View>

        {/* Termos */}
        {termsOfService && (
          <View style={{ marginTop: 8 }} wrap={false}>
            <Text style={styles.sectionTitle}>TERMOS E CONDICOES</Text>
            <Text style={styles.termsBlock}>{termsOfService}</Text>
          </View>
        )}

        {/* Garantia */}
        {warrantyPolicy && (
          <View style={{ marginTop: 6 }} wrap={false}>
            <Text style={styles.sectionTitle}>POLITICA DE GARANTIA</Text>
            <Text style={styles.termsBlock}>{warrantyPolicy}</Text>
          </View>
        )}

        {/* Assinatura */}
        <View style={styles.assinatura}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>ASSINATURA DO CLIENTE</Text>
          <Text>{customer?.name ?? ""}</Text>
          {customer?.cpf && <Text>CPF: {customer.cpf}</Text>}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          {store.name} - Documento gerado em {new Date().toLocaleDateString("pt-BR")} {new Date().toLocaleTimeString("pt-BR")}
        </Text>
      </Page>
    </Document>
  );
}
