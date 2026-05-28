/* @react-pdf/renderer usa <Image> proprio (nao precisa alt). */
/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

/**
 * PDFs binarios dos termos da OS — paridade Laravel OrdemServicoPdfController:
 *  - recibo (gerarHtmlRecibo): RECIBO, valor por extenso, servicos, garantia,
 *    assinatura eletronica do prestador, "SEM VALOR FISCAL".
 *  - termo de entrega (gerarHtmlTermoEntrega): tema verde, "Conferi o
 *    funcionamento", assinatura do cliente.
 *  - termo de devolucao (gerarHtmlTermoDevolucao): tema laranja, devolucao sem
 *    servico, assinatura do cliente.
 *
 * Migrado de HTML print para @react-pdf (item 1) — mesmo padrao do recibo de
 * venda (sale-receipt-pdf) e dompdf do Laravel.
 */

const GOLD = "#c9a84c";
const TEXT = "#1a1a1a";
const MUTED = "#666";
const LABEL = "#888";
const LIGHT_BG = "#fafafa";
const GREEN = "#28a745";
const GREEN_DARK = "#2e7d32";
const GREEN_BG = "#e8f5e9";
const ORANGE = "#FF6B35";
const ORANGE_BG = "#fff4ef";

interface StoreHeader {
  name: string;
  cnpj: string | null;
  phone: string | null;
  logoDataUrl: string | null;
}

interface OsHeaderInfo {
  number: string;
  deviceType: string | null;
  deviceModel: string | null;
  imei: string | null;
}

interface CustomerInfo {
  name: string | null;
  cpf: string | null;
  phone: string | null;
}

const base = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 40,
    paddingHorizontal: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    lineHeight: 1.4,
    color: TEXT,
  },
  headerRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 46, height: 46, objectFit: "contain", marginRight: 10 },
  storeName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: TEXT },
  storeMeta: { fontSize: 8, color: MUTED, marginTop: 1 },
  fieldRow: { flexDirection: "row", marginBottom: 4 },
  fieldLabel: { fontFamily: "Helvetica-Bold", color: "#555", marginRight: 6 },
  infoBox: {
    backgroundColor: "#f5f5f5",
    borderLeftWidth: 4,
    padding: 12,
    marginVertical: 12,
  },
  deviceBox: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 12,
    marginVertical: 12,
    backgroundColor: LIGHT_BG,
  },
  boxTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  bodyText: { textAlign: "justify", marginVertical: 6, lineHeight: 1.6 },
  signature: { marginTop: 56, alignItems: "center" },
  signatureLine: {
    borderTopWidth: 2,
    borderTopColor: "#000",
    width: 320,
    paddingTop: 6,
    alignItems: "center",
  },
  signatureLabel: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  signatureSub: { fontSize: 8, color: MUTED, marginTop: 4, textAlign: "center" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    paddingTop: 8,
    textAlign: "center",
    fontSize: 7.5,
    color: "#999",
  },
});

function Header({ store }: { store: StoreHeader }) {
  return (
    <View>
      <View style={base.headerRow}>
        {store.logoDataUrl && <Image src={store.logoDataUrl} style={base.logo} />}
        <View style={{ flex: 1 }}>
          <Text style={base.storeName}>
            {store.name}
            {store.cnpj ? ` - CNPJ: ${store.cnpj}` : ""}
          </Text>
          <Text style={base.storeMeta}>Assistencia Tecnica Especializada</Text>
          {store.phone ? <Text style={base.storeMeta}>{store.phone}</Text> : null}
        </View>
      </View>
      <View style={{ borderBottomWidth: 3, borderBottomColor: GOLD, marginTop: 8 }} />
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={base.fieldRow}>
      <Text style={base.fieldLabel}>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

function Footer({ osNumber, extra }: { osNumber: string; extra?: string }) {
  const now = new Date();
  return (
    <Text style={base.footer} fixed>
      Documento gerado em {now.toLocaleDateString("pt-BR")}{" "}
      {now.toLocaleTimeString("pt-BR")} - OS: {osNumber}
      {extra ? ` - ${extra}` : ""}
    </Text>
  );
}

const fmtBRL = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── RECIBO ──────────────────────────────────────────────────────────
export interface ReciboPdfData {
  store: StoreHeader;
  os: OsHeaderInfo;
  customer: CustomerInfo;
  valorTotal: number;
  valorPago: number;
  descontoPagamento: number;
  formaPagamento: string | null;
  extenso: string;
  prazoGarantiaMeses: number;
  vencimentoGarantia: Date;
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  quotes: Array<{ reason: string; newTotal: number; additionalServices: string | null }>;
  partsAmount: number;
  discount: number;
}

export function ReciboPdfDocument(data: ReciboPdfData) {
  const now = new Date();
  const meses = ["janeiro","fevereiro","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return (
    <Document>
      <Page size="A4" style={base.page}>
        <Header store={data.store} />

        {/* Header RECIBO */}
        <View style={{ borderWidth: 2, borderColor: "#000", padding: 10, marginVertical: 12, alignItems: "center", backgroundColor: "#f9f9f9" }}>
          <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold" }}>RECIBO</Text>
          <Text style={{ fontSize: 9, marginTop: 3 }}>No: {data.os.number}</Text>
          <Text style={{ fontSize: 9 }}>Data de Emissao: {now.toLocaleDateString("pt-BR")}</Text>
        </View>

        {/* Valor */}
        <View style={{ borderWidth: 2, borderColor: "#000", borderRadius: 8, padding: 12, marginVertical: 10, alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold" }}>{fmtBRL(data.valorPago)}</Text>
          <Text style={{ fontSize: 9, marginTop: 4 }}>({data.extenso})</Text>
          {data.descontoPagamento > 0 && (
            <Text style={{ fontSize: 8, color: GREEN, marginTop: 6 }}>
              Desconto no pagamento: {fmtBRL(data.descontoPagamento)} (Valor original: {fmtBRL(data.valorTotal)})
            </Text>
          )}
          {data.formaPagamento ? (
            <Text style={{ fontSize: 8, marginTop: 4 }}>Forma de Pagamento: {data.formaPagamento}</Text>
          ) : null}
        </View>

        {/* Corpo */}
        <Text style={base.bodyText}>
          Recebi(emos) de <Text style={{ fontFamily: "Helvetica-Bold" }}>{data.customer.name ?? "—"}</Text>,
          portador(a) do CPF <Text style={{ fontFamily: "Helvetica-Bold" }}>{data.customer.cpf ?? "—"}</Text>,
          a quantia de <Text style={{ fontFamily: "Helvetica-Bold" }}>{fmtBRL(data.valorPago)}</Text> ({data.extenso})
          {data.descontoPagamento > 0
            ? `, com desconto de ${fmtBRL(data.descontoPagamento)} sobre o valor original de ${fmtBRL(data.valorTotal)}`
            : ""}
          , referente ao(s) servico(s) de assistencia tecnica prestado(s) conforme Ordem de Servico{" "}
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{data.os.number}</Text>.
          {data.formaPagamento ? ` Pagamento realizado via ${data.formaPagamento}.` : ""}
        </Text>

        {/* Servicos */}
        <View style={{ backgroundColor: "#f5f5f5", borderLeftWidth: 4, borderLeftColor: "#000", padding: 12, marginVertical: 12 }}>
          <Text style={base.boxTitle}>SERVICO(S) REALIZADO(S)</Text>
          {data.items.length > 0 ? (
            data.items.map((it, i) => (
              <Text key={i} style={{ marginVertical: 2 }}>
                • <Text style={{ fontFamily: "Helvetica-Bold" }}>{it.description}</Text>
                {it.quantity > 1 ? ` (${it.quantity}x ${fmtBRL(it.unitPrice)})` : ""} - {fmtBRL(it.total)}
              </Text>
            ))
          ) : (
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Assistencia Tecnica</Text>
          )}

          {data.quotes.length > 0 && (
            <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: "#ccc", paddingTop: 8 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>
                Servicos Adicionais (orcamentos aprovados):
              </Text>
              {data.quotes.map((q, i) => (
                <View key={i} style={{ marginVertical: 2 }}>
                  <Text>
                    • <Text style={{ fontFamily: "Helvetica-Bold" }}>{q.reason}</Text> — {fmtBRL(q.newTotal)}
                  </Text>
                  {q.additionalServices ? (
                    <Text style={{ fontSize: 8, color: MUTED, marginLeft: 8 }}>{q.additionalServices}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {data.partsAmount > 0 && (
            <Text style={{ marginTop: 8 }}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Pecas/Componentes:</Text> {fmtBRL(data.partsAmount)}
            </Text>
          )}
          {data.discount > 0 && (
            <Text style={{ marginTop: 4, color: GREEN }}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Desconto:</Text> -{fmtBRL(data.discount)}
            </Text>
          )}
          <Text style={{ marginTop: 10 }}>
            Equipamento: <Text style={{ fontFamily: "Helvetica-Bold" }}>{data.os.deviceType ?? "Nao informado"}</Text>
            {data.os.deviceModel ? ` - ${data.os.deviceModel}` : ""}
          </Text>
        </View>

        {/* Garantia */}
        <View style={{ backgroundColor: GREEN_BG, borderWidth: 1, borderStyle: "dashed", borderColor: "#4caf50", borderRadius: 8, padding: 12, marginVertical: 10 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: GREEN_DARK, marginBottom: 4 }}>GARANTIA DO SERVICO</Text>
          <Text style={{ fontSize: 9 }}>Prazo de Garantia: {data.prazoGarantiaMeses} meses</Text>
          <Text style={{ fontSize: 9 }}>Valida ate: {data.vencimentoGarantia.toLocaleDateString("pt-BR")}</Text>
          <Text style={{ fontSize: 8, color: "#555", marginTop: 8 }}>
            A garantia cobre defeitos relacionados ao servico realizado. Nao cobre danos causados por mau uso,
            quedas, contato com liquidos ou intervencao de terceiros.
          </Text>
        </View>

        <Text style={{ textAlign: "right", marginTop: 16 }}>
          {now.getDate()} de {meses[now.getMonth()]} de {now.getFullYear()}.
        </Text>

        {/* Assinatura prestador */}
        <View style={base.signature}>
          <Text style={{ fontSize: 10, color: GREEN_DARK, fontStyle: "italic", marginBottom: 6 }}>
            ~ Assinado eletronicamente ~
          </Text>
          <View style={base.signatureLine}>
            <Text style={base.signatureLabel}>Assinatura do Prestador de Servico</Text>
          </View>
          <Text style={base.signatureSub}>
            {data.store.name}
            {data.store.cnpj ? `\nCNPJ: ${data.store.cnpj}` : ""}
          </Text>
        </View>

        <Footer osNumber={data.os.number} extra="SEM VALOR FISCAL" />
      </Page>
    </Document>
  );
}

// ── TERMO DE ENTREGA / DEVOLUCAO ────────────────────────────────────
export interface TermPdfData {
  store: StoreHeader;
  os: OsHeaderInfo;
  customer: CustomerInfo;
}

function TermDocument({
  data,
  kind,
}: {
  data: TermPdfData;
  kind: "entrega" | "devolucao";
}) {
  const now = new Date();
  const isEntrega = kind === "entrega";
  const accent = isEntrega ? GREEN : ORANGE;
  const accentBg = isEntrega ? GREEN_BG : ORANGE_BG;
  const titulo = isEntrega ? "TERMO DE ENTREGA DE EQUIPAMENTO" : "TERMO DE DEVOLUCAO DE EQUIPAMENTO";
  const deviceTitle = isEntrega ? "EQUIPAMENTO ENTREGUE" : "DADOS DO EQUIPAMENTO DEVOLVIDO";
  const dataLabel = isEntrega ? "Data de Entrega:" : "Data de Devolucao:";

  return (
    <Document>
      <Page size="A4" style={base.page}>
        <Header store={data.store} />

        <View style={{ alignItems: "center", marginVertical: 16, backgroundColor: accentBg, padding: 14, borderRadius: 8 }}>
          <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold", color: accent }}>{titulo}</Text>
        </View>

        <View style={[base.infoBox, { borderLeftColor: accent }]}>
          <Field label="Ordem de Servico:" value={data.os.number} />
          <Field
            label={dataLabel}
            value={`${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          />
          <Field label="Cliente:" value={data.customer.name ?? "—"} />
          <Field label="CPF:" value={data.customer.cpf ?? "—"} />
          <Field label="Telefone:" value={data.customer.phone ?? "—"} />
        </View>

        <View style={base.deviceBox}>
          <Text style={[base.boxTitle, { color: accent }]}>{deviceTitle}</Text>
          <Field label="Tipo:" value={data.os.deviceType || "Nao informado"} />
          {data.os.deviceModel ? <Field label="Modelo:" value={data.os.deviceModel} /> : null}
          {data.os.imei ? <Field label="IMEI/Serie:" value={data.os.imei} /> : null}
        </View>

        {isEntrega ? (
          <View>
            <Text style={base.bodyText}>
              Declaro ter recebido o equipamento acima descrito, apos a realizacao dos servicos de
              assistencia tecnica conforme Ordem de Servico{" "}
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{data.os.number}</Text>.
            </Text>
            <Text style={base.bodyText}>
              Declaro que conferi o funcionamento do equipamento no ato da entrega, nao tendo nenhuma
              reclamacao a fazer neste momento.
            </Text>
            <Text style={{ fontSize: 9, color: MUTED, marginTop: 6 }}>
              * Informacoes sobre valor, garantia e detalhes do servico constam no Recibo de Servico.
            </Text>
          </View>
        ) : (
          <View>
            <Text style={base.bodyText}>
              Declaro ter recebido o equipamento acima descrito, devolvido nas mesmas condicoes em que foi
              entregue para analise/reparo, conforme Ordem de Servico{" "}
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{data.os.number}</Text>.
            </Text>
            <Text style={base.bodyText}>
              Estou ciente de que o equipamento foi devolvido sem a realizacao do servico solicitado, seja
              por motivo de cancelamento, nao aprovacao do orcamento, ou outro motivo acordado entre as partes.
            </Text>
            <Text style={base.bodyText}>
              Declaro que conferi o equipamento e seus acessorios (se houver) e os recebi em perfeito estado,
              nao tendo nenhuma reclamacao a fazer neste momento.
            </Text>
          </View>
        )}

        {/* Assinatura cliente */}
        <View style={base.signature}>
          <View style={base.signatureLine}>
            <Text style={base.signatureLabel}>Assinatura do Cliente</Text>
          </View>
          <Text style={base.signatureSub}>
            {data.customer.name ?? "—"}
            {data.customer.cpf ? `\nCPF: ${data.customer.cpf}` : ""}
          </Text>
        </View>

        <Footer osNumber={data.os.number} />
      </Page>
    </Document>
  );
}

export function TermoEntregaPdfDocument(data: TermPdfData) {
  return <TermDocument data={data} kind="entrega" />;
}

export function TermoDevolucaoPdfDocument(data: TermPdfData) {
  return <TermDocument data={data} kind="devolucao" />;
}
