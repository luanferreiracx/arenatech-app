/* @react-pdf/renderer usa <Image> proprio (nao precisa alt). */
/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export interface SaleReceiptPdfData {
  sale: {
    number: string;
    saleDate: Date;
    totalAmount: unknown;
    subtotal?: unknown;
    discountAmount: unknown;
    discountType?: string | null;
    discountValue?: unknown;
    paidAmount: unknown;
    surchargeAmount?: unknown;
    changeAmount: unknown;
    paymentDetails: unknown;
    observations: string | null;
    refundDueAmount?: unknown;
    refundDueMethod?: string | null;
    signedViaAutentique?: boolean;
    items: Array<{
      description: string;
      quantity: number;
      unitPrice: unknown;
      total: unknown;
      imei?: string | null;
      serial?: string | null;
      condition?: string | null;
      batteryHealth?: number | null;
      warrantyMonths?: number | null;
      isUpgrade?: boolean;
    }>;
    upgrades?: Array<{
      description: string;
      imei?: string | null;
      serial?: string | null;
      condition?: string | null;
      batteryHealth?: number | null;
      abatedValue: unknown;
    }>;
  };
  customer: {
    name: string;
    cpf: string | null;
    phone: string | null;
  } | null;
  sellerName?: string | null;
  store: {
    name: string;
    cnpj: string | null;
    phone: string | null;
    address?: string | null;
    /** Data URL (base64) — preferido sobre URL remota para fidelidade no PDF. */
    logoDataUrl: string | null;
  };
}

// Paleta Arena Tech (paridade Laravel intranetpdv recibo.blade.php)
const GOLD = "#2ec4b6";
const NIGHT = "#1a1a2e";
const TEXT = "#1a1a1a";
const MUTED = "#666";
const LABEL = "#888";
const LIGHT_BG = "#fafafa";
const SOFT_BG = "#f3f4f6";
const BORDER = "#e5e7eb";
const SOFT_BORDER = "#f0f0f0";
const RED = "#dc2626";
const GREEN = "#16a34a";
const GREEN_DARK = "#10b981";
const GREEN_LIGHT = "#f0fdf4";
const BLUE_INFO_BG = "#eff6ff";
const BLUE_INFO_BORDER = "#bfdbfe";
const BLUE_INFO_TEXT = "#1d4ed8";
const AMBER = "#b45309";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 34,
    fontSize: 9,
    fontFamily: "Helvetica",
    lineHeight: 1.35,
    color: TEXT,
  },

  // Header
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

  // Section
  section: { marginBottom: 8 },
  sectionTitle: {
    backgroundColor: SOFT_BG,
    paddingVertical: 3,
    paddingHorizontal: 8,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    marginBottom: 5,
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
    color: "#333",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  // Info grid
  infoCols: { flexDirection: "row", gap: 10 },
  infoCol: { flex: 1 },
  field: { marginBottom: 3 },
  fieldLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: LABEL,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  fieldValue: {
    fontSize: 9,
    paddingVertical: 2,
    paddingHorizontal: 4,
    backgroundColor: LIGHT_BG,
    borderWidth: 1,
    borderColor: "#eee",
  },
  fieldValueMuted: { color: "#999" },

  // Itens table
  itemsTable: { marginBottom: 8 },
  itemsHeaderRow: { flexDirection: "row", backgroundColor: NIGHT },
  itemsHeader: {
    color: "#fff",
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  itemsRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  itemsRowEven: { backgroundColor: LIGHT_BG },
  itemsCell: { paddingVertical: 4, paddingHorizontal: 6, fontSize: 8.5 },
  produtoNome: { fontFamily: "Helvetica-Bold" },
  itemMeta: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  badgeUpgrade: {
    backgroundColor: GOLD,
    color: "#fff",
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 1,
    paddingHorizontal: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginLeft: 4,
  },

  // Upgrades box (azul info)
  upgradesBox: {
    borderWidth: 1,
    borderColor: BLUE_INFO_BORDER,
    backgroundColor: BLUE_INFO_BG,
    padding: 6,
    marginBottom: 8,
  },
  upgradesTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: BLUE_INFO_TEXT,
    marginBottom: 4,
  },
  upgradeRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#dbeafe",
  },
  upgradeAbated: { color: GREEN, fontFamily: "Helvetica-Bold", textAlign: "right" },

  // Totais
  totaisWrapper: { alignItems: "flex-end", marginTop: 8 },
  totaisTable: {
    width: 240,
    borderWidth: 1,
    borderColor: BORDER,
  },
  totaisRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: SOFT_BORDER,
  },
  totaisLabel: { flex: 1, color: "#555", fontSize: 9 },
  totaisValue: { fontFamily: "Helvetica-Bold", textAlign: "right", fontSize: 9 },
  totaisRowDiscount: { },
  totaisLabelDiscount: { flex: 1, color: RED, fontSize: 9 },
  totaisValueDiscount: { color: RED, fontFamily: "Helvetica-Bold", textAlign: "right", fontSize: 9 },
  totaisTotalRow: { flexDirection: "row", backgroundColor: NIGHT, paddingVertical: 8, paddingHorizontal: 8 },
  totaisTotalLabel: { flex: 1, color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 12 },
  totaisTotalValue: { color: "#fff", fontFamily: "Helvetica-Bold", textAlign: "right", fontSize: 12 },
  paymentLabel: { flex: 1, color: MUTED, fontSize: 7.5 },
  paymentValue: { color: MUTED, fontSize: 7.5, fontFamily: "Helvetica-Bold", textAlign: "right" },
  paymentsHeaderRow: { flexDirection: "row", paddingTop: 6, paddingHorizontal: 8 },
  paymentsHeader: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", color: "#555", letterSpacing: 0.3 },

  // Assinatura
  signatureWrapper: { marginTop: 28, alignItems: "center" },
  signatureBoxAutentique: {
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: GREEN_DARK,
    borderRadius: 6,
    backgroundColor: GREEN_LIGHT,
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: 280,
    alignItems: "center",
  },
  signatureAutentique: { fontSize: 8, color: GREEN_DARK, fontStyle: "italic" },
  signatureAutentiqueSmall: { fontSize: 7, color: "#059669", marginTop: 2 },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#333", paddingTop: 4, width: 280, alignItems: "center", marginTop: 50 },
  signatureName: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginTop: 4 },
  signatureCnpj: { fontSize: 7, color: LABEL, marginTop: 1 },

  // Refund (downgrade)
  refundLabel: { flex: 1, color: AMBER, fontSize: 9 },
  refundValue: { color: AMBER, fontFamily: "Helvetica-Bold", textAlign: "right", fontSize: 9 },

  // Footer
  footer: {
    borderTopWidth: 2,
    borderTopColor: GOLD,
    paddingTop: 8,
    marginTop: 18,
    alignItems: "center",
  },
  footerLine: { fontSize: 7.5, color: "#999" },
  footerLegal: {
    fontSize: 6.5,
    color: "#aaa",
    marginTop: 4,
    textAlign: "center",
    lineHeight: 1.4,
  },
});

const fmtBRL = (v: unknown) =>
  "R$ " +
  Number(v ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDateTime = (d: Date) => {
  const dt = new Date(d);
  return (
    dt.toLocaleDateString("pt-BR") +
    " " +
    dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
};

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

export function SaleReceiptPdfDocument({ sale, customer, sellerName, store }: SaleReceiptPdfData) {
  const paymentList = Array.isArray(sale.paymentDetails)
    ? (sale.paymentDetails as Array<{ method: string; amount: number; installments?: number }>)
    : [];

  const subtotal = sale.subtotal != null ? Number(sale.subtotal) : Number(sale.totalAmount);
  const discount = Number(sale.discountAmount ?? 0);
  const total = Number(sale.totalAmount);
  const surcharge = Number(sale.surchargeAmount ?? 0);
  const customerPaidTotal = total + surcharge;
  const refundDue = Number(sale.refundDueAmount ?? 0);
  const upgrades = sale.upgrades ?? [];
  const upgradeAbated = upgrades.reduce((sum, u) => sum + Number(u.abatedValue ?? 0), 0);

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
            <Text style={styles.docDate}>{fmtDateTime(sale.saleDate)}</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />

        {/* Cliente + Dados da Venda */}
        <View style={styles.section}>
          <View style={styles.infoCols}>
            <View style={styles.infoCol}>
              <Text style={styles.sectionTitle}>Cliente</Text>
              {customer ? (
                <>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Nome</Text>
                    <Text style={styles.fieldValue}>{customer.name}</Text>
                  </View>
                  {customer.cpf && (
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>CPF</Text>
                      <Text style={styles.fieldValue}>{customer.cpf}</Text>
                    </View>
                  )}
                  {customer.phone && (
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Telefone</Text>
                      <Text style={styles.fieldValue}>{customer.phone}</Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.field}>
                  <Text style={[styles.fieldValue, styles.fieldValueMuted]}>Consumidor final</Text>
                </View>
              )}
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.sectionTitle}>Dados da Venda</Text>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Vendedor</Text>
                <Text style={styles.fieldValue}>{sellerName ?? "-"}</Text>
              </View>
              {paymentList.length > 0 && (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Forma de Pagamento</Text>
                  <Text style={styles.fieldValue}>
                    {paymentList
                      .map(
                        (p) =>
                          p.method.toUpperCase() +
                          (p.installments && p.installments > 1 ? ` (${p.installments}x)` : ""),
                      )
                      .join(" + ")}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Itens */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Itens da Venda</Text>
          <View style={styles.itemsTable}>
            <View style={styles.itemsHeaderRow}>
              <Text style={[styles.itemsHeader, { flex: 3 }]}>Produto</Text>
              <Text style={[styles.itemsHeader, { flex: 1.4 }]}>IMEI/Serie</Text>
              <Text style={[styles.itemsHeader, { width: 36, textAlign: "right" }]}>Qtd</Text>
              <Text style={[styles.itemsHeader, { width: 70, textAlign: "right" }]}>Preco Unit.</Text>
              <Text style={[styles.itemsHeader, { width: 70, textAlign: "right" }]}>Subtotal</Text>
            </View>
            {sale.items.map((it, i) => (
              <View
                key={i}
                style={[styles.itemsRow, i % 2 === 1 ? styles.itemsRowEven : {}]}
                wrap={false}
              >
                <View style={[styles.itemsCell, { flex: 3 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                    <Text style={styles.produtoNome}>{it.description}</Text>
                    {it.isUpgrade && <Text style={styles.badgeUpgrade}>UPGRADE</Text>}
                  </View>
                  {(it.condition || it.batteryHealth != null || it.warrantyMonths) && (
                    <Text style={styles.itemMeta}>
                      {[
                        it.condition ? CONDITION_LABELS[it.condition] ?? it.condition : null,
                        it.warrantyMonths
                          ? `Garantia: ${it.warrantyMonths} ${it.warrantyMonths === 1 ? "mes" : "meses"}`
                          : null,
                        it.batteryHealth != null ? `Bateria: ${it.batteryHealth}%` : null,
                      ]
                        .filter(Boolean)
                        .join(" | ")}
                    </Text>
                  )}
                </View>
                <Text style={[styles.itemsCell, { flex: 1.4 }]}>
                  {[
                    it.imei || null,
                    it.serial ? `S/N: ${it.serial}` : null,
                  ]
                    .filter(Boolean)
                    .join("\n") || "-"}
                </Text>
                <Text style={[styles.itemsCell, { width: 36, textAlign: "right" }]}>{it.quantity}</Text>
                <Text style={[styles.itemsCell, { width: 70, textAlign: "right" }]}>
                  {fmtBRL(it.unitPrice)}
                </Text>
                <Text
                  style={[
                    styles.itemsCell,
                    { width: 70, textAlign: "right", fontFamily: "Helvetica-Bold" },
                  ]}
                >
                  {fmtBRL(it.total)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Upgrades recebidos */}
        {upgrades.length > 0 && (
          <View style={styles.section}>
            <View style={styles.upgradesBox}>
              <Text style={styles.upgradesTitle}>Aparelhos Recebidos em Troca</Text>
              {upgrades.map((upg, i) => (
                <View key={i} style={styles.upgradeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9 }}>
                      {upg.description}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {[
                        upg.imei ? `IMEI: ${upg.imei}` : null,
                        upg.serial ? `S/N: ${upg.serial}` : null,
                        upg.condition ? `Condicao: ${CONDITION_LABELS[upg.condition] ?? upg.condition}` : null,
                        upg.batteryHealth != null ? `Bateria: ${upg.batteryHealth}%` : null,
                      ]
                        .filter(Boolean)
                        .join(" | ")}
                    </Text>
                  </View>
                  <Text style={[styles.upgradeAbated, { width: 100 }]}>
                    -{fmtBRL(upg.abatedValue)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Totais — "Total" é o valor das mercadorias (soma de tudo); trade-in e
            desconto abatem; "A pagar" é o líquido quitado nas formas de pagamento. */}
        <View style={styles.totaisWrapper}>
          <View style={styles.totaisTable}>
            <View style={styles.totaisTotalRow}>
              <Text style={styles.totaisTotalLabel}>TOTAL</Text>
              <Text style={styles.totaisTotalValue}>{fmtBRL(subtotal)}</Text>
            </View>
            {upgradeAbated > 0 && (
              <View style={styles.totaisRow}>
                <Text style={styles.totaisLabelDiscount}>
                  {upgrades.length > 1 ? "Aparelhos na troca" : "Aparelho na troca"}
                </Text>
                <Text style={styles.totaisValueDiscount}>-{fmtBRL(upgradeAbated)}</Text>
              </View>
            )}
            {discount > 0 && (
              <View style={styles.totaisRow}>
                <Text style={styles.totaisLabelDiscount}>
                  Desconto
                  {sale.discountType === "percentage" && sale.discountValue != null
                    ? ` (${Number(sale.discountValue)}%)`
                    : ""}
                </Text>
                <Text style={styles.totaisValueDiscount}>-{fmtBRL(discount)}</Text>
              </View>
            )}
            <View style={styles.totaisRow}>
              <Text style={styles.totaisLabel}>A pagar</Text>
              <Text style={styles.totaisValue}>{fmtBRL(total)}</Text>
            </View>
            {surcharge > 0 && (
              <>
                <View style={styles.totaisRow}>
                  <Text style={styles.totaisLabel}>Acrescimo (cartao/parcelamento)</Text>
                  <Text style={styles.totaisValue}>+{fmtBRL(surcharge)}</Text>
                </View>
                <View style={styles.totaisRow}>
                  <Text style={styles.totaisLabel}>Total pago pelo cliente</Text>
                  <Text style={styles.totaisValue}>{fmtBRL(customerPaidTotal)}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Pagamentos detalhe */}
        {(paymentList.length > 0 || refundDue > 0) && (
          <View style={[styles.totaisWrapper, { marginTop: 6 }]}>
            <View style={styles.totaisTable}>
              <View style={styles.paymentsHeaderRow}>
                <Text style={styles.paymentsHeader}>Pagamentos</Text>
              </View>
              {paymentList.map((p, i) => (
                <View key={i} style={styles.totaisRow}>
                  <Text style={styles.paymentLabel}>
                    {p.method.toUpperCase()}
                    {p.installments && p.installments > 1
                      ? ` (${p.installments}x de ${fmtBRL((p.amount ?? 0) / 100 / p.installments)})`
                      : ""}
                  </Text>
                  <Text style={styles.paymentValue}>{fmtBRL((p.amount ?? 0) / 100)}</Text>
                </View>
              ))}
              {refundDue > 0 && (
                <View style={styles.totaisRow}>
                  <Text style={styles.refundLabel}>
                    Diferenca a devolver
                    {sale.refundDueMethod
                      ? ` (${sale.refundDueMethod === "cash" ? "em dinheiro" : "via PIX"})`
                      : ""}
                  </Text>
                  <Text style={styles.refundValue}>-{fmtBRL(refundDue)}</Text>
                </View>
              )}
              {Number(sale.changeAmount) > 0 && (
                <View style={styles.totaisRow}>
                  <Text style={styles.totaisLabel}>Troco</Text>
                  <Text style={[styles.totaisValue, { color: GREEN }]}>
                    {fmtBRL(sale.changeAmount)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Observacoes */}
        {sale.observations && (
          <View style={{ marginTop: 10 }} wrap={false}>
            <Text style={styles.sectionTitle}>Observacoes</Text>
            <Text style={styles.fieldValue}>{sale.observations}</Text>
          </View>
        )}

        {/* Assinatura da loja */}
        <View style={styles.signatureWrapper}>
          {sale.signedViaAutentique ? (
            <View style={styles.signatureBoxAutentique}>
              <Text style={styles.signatureAutentique}>~ assinado eletronicamente ~</Text>
              <Text style={styles.signatureAutentiqueSmall}>Assinado via Autentique</Text>
            </View>
          ) : (
            <View style={styles.signatureLine}>
              <Text style={styles.signatureName}>{store.name}</Text>
              {store.cnpj && <Text style={styles.signatureCnpj}>CNPJ: {store.cnpj}</Text>}
            </View>
          )}
          {sale.signedViaAutentique && (
            <View style={{ marginTop: 4, alignItems: "center" }}>
              <Text style={styles.signatureName}>{store.name}</Text>
              {store.cnpj && <Text style={styles.signatureCnpj}>CNPJ: {store.cnpj}</Text>}
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerLine}>
            {store.name}
            {store.cnpj ? ` | CNPJ: ${store.cnpj}` : ""}
            {store.phone ? ` | ${store.phone}` : ""}
          </Text>
          <Text style={styles.footerLine}>
            Documento gerado em{" "}
            {new Date().toLocaleDateString("pt-BR")} as{" "}
            {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </Text>
          <Text style={styles.footerLegal}>
            Este documento e valido como comprovante de transacao comercial. Conserve-o para fins de
            garantia e eventuais trocas conforme politica da loja.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
