"use client";

import Link from "next/link";
import { format } from "date-fns";
import {
  SERVICE_ORDER_STATUS_LABELS,
  WARRANTY_TYPE_LABELS,
  type ServiceOrderStatus,
} from "@/lib/validators/service-order";
import { PAYMENT_METHOD_LABELS } from "@/lib/validators/cashier";

/**
 * Seções read-only do detalhe da OS, extraídas do componente principal
 * (refactor: o `service-order-detail` concentrava ~2200 linhas). São puramente
 * de exibição — recebem só os campos que leem, sem estado nem mutations.
 */

function formatMoney(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

type DateLike = string | Date;

const SECTION_CARD = "rounded-lg border border-border p-4";
const SECTION_TITLE = "text-xs font-semibold text-primary uppercase tracking-wider mb-3";

// ── Histórico (status + eventos de assinatura) ──

interface HistoryEntry {
  id: string;
  newStatus: string;
  notes: string | null;
  userName: string;
  createdAt: DateLike;
}

interface OrderHistoryTimelineProps {
  history: HistoryEntry[];
  signatureSignedAt?: DateLike | null;
  physicalSignature?: boolean | null;
  deliveryTermSignedAt?: DateLike | null;
  deliveryTermPhysical?: boolean | null;
  returnTermSignedAt?: DateLike | null;
  returnTermPhysical?: boolean | null;
}

type TimelineEvent = {
  id: string;
  label: string;
  detail: string | null;
  date: Date;
  kind: "status" | "signature";
  author?: string | null;
  notes?: string | null;
};

export function OrderHistoryTimeline(order: OrderHistoryTimelineProps) {
  const events: TimelineEvent[] = [];

  for (const h of order.history) {
    events.push({
      id: h.id,
      label: SERVICE_ORDER_STATUS_LABELS[h.newStatus as ServiceOrderStatus] ?? h.newStatus,
      detail: h.userName || null,
      author: h.userName || null,
      notes: h.notes || null,
      date: new Date(h.createdAt),
      kind: "status",
    });
  }
  if (order.signatureSignedAt) {
    events.push({
      id: "sig-entry",
      label: "Assinatura de Entrada",
      detail: order.physicalSignature ? "Assinatura fisica confirmada" : "Assinatura digital (Autentique)",
      date: new Date(order.signatureSignedAt),
      kind: "signature",
    });
  }
  if (order.deliveryTermSignedAt) {
    events.push({
      id: "sig-delivery",
      label: "Termo de Entrega Assinado",
      detail: order.deliveryTermPhysical ? "Assinatura fisica" : "Assinatura digital (Autentique)",
      date: new Date(order.deliveryTermSignedAt),
      kind: "signature",
    });
  }
  if (order.returnTermSignedAt) {
    events.push({
      id: "sig-return",
      label: "Termo de Devolucao Assinado",
      detail: order.returnTermPhysical ? "Assinatura fisica" : "Assinatura digital (Autentique)",
      date: new Date(order.returnTermSignedAt),
      kind: "signature",
    });
  }
  events.sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className={SECTION_CARD}>
      <h3 className={SECTION_TITLE}>Historico</h3>
      <div className="relative pl-6 space-y-4">
        <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" />
        {events.map((e) => (
          <div key={e.id} className="relative">
            <div
              className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 bg-card ${
                e.kind === "signature" ? "border-amber-500" : "border-primary"
              }`}
            />
            <div className="text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{e.label}</span>
                <span className="text-xs text-muted-foreground">
                  {format(e.date, "dd/MM/yyyy HH:mm")}
                </span>
              </div>
              {e.author && (
                <p className="text-xs text-muted-foreground mt-0.5">por {e.author}</p>
              )}
              {e.notes && (
                <p className="text-xs italic mt-1 px-2 py-1 rounded bg-muted/40 border-l-2 border-primary/40">
                  “{e.notes}”
                </p>
              )}
              {e.kind === "signature" && e.detail && (
                <p className="text-xs text-muted-foreground italic mt-1">{e.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pagamento ──

interface OrderPaymentCardProps {
  totalAmount: number;
  paidAmount: number;
  paymentDiscount: number;
  paymentMethod?: string | null;
  paymentDate?: DateLike | null;
  linkedSale?: { id: string; number: string } | null;
}

export function OrderPaymentCard(order: OrderPaymentCardProps) {
  const pending = Math.max(0, order.totalAmount - order.paidAmount - order.paymentDiscount);
  return (
    <div className={SECTION_CARD}>
      <h3 className={SECTION_TITLE}>Pagamento</h3>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Valor Total</span><span className="font-bold text-primary font-mono">{formatMoney(order.totalAmount)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Valor Pago</span><span className="font-mono text-success">{formatMoney(order.paidAmount)}</span></div>
        {pending > 0 && (
          <div className="flex justify-between rounded bg-warning/10 px-2 py-1">
            <span className="text-warning font-semibold">Pendente</span>
            <span className="text-warning font-mono font-bold">{formatMoney(pending)}</span>
          </div>
        )}
        {order.paymentDiscount > 0 && (
          <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="text-warning font-mono">{formatMoney(order.paymentDiscount)}</span></div>
        )}
        {order.paymentMethod && (
          <div className="flex justify-between"><span className="text-muted-foreground">Forma</span><span>{PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}</span></div>
        )}
        {order.paymentDate && (
          <div className="flex justify-between"><span className="text-muted-foreground">Data</span><span>{format(new Date(order.paymentDate), "dd/MM/yyyy")}</span></div>
        )}
        {order.linkedSale && (
          <div className="flex justify-between border-t border-border pt-2 mt-2">
            <span className="text-muted-foreground">Venda PDV</span>
            <Link href={`/pdv/${order.linkedSale.id}`} className="text-primary hover:underline font-mono text-xs">
              #{order.linkedSale.number}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Datas ──

interface OrderDatesCardProps {
  entryDate: DateLike;
  estimatedDate?: DateLike | null;
  completedDate?: DateLike | null;
  deliveredDate?: DateLike | null;
}

export function OrderDatesCard(order: OrderDatesCardProps) {
  return (
    <div className={SECTION_CARD}>
      <h3 className={SECTION_TITLE}>Datas</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Entrada</span>
          <span>{format(new Date(order.entryDate), "dd/MM/yyyy HH:mm")}</span>
        </div>
        {order.estimatedDate && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Previsao</span>
            <span>{format(new Date(order.estimatedDate), "dd/MM/yyyy")}</span>
          </div>
        )}
        {order.completedDate && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Conclusao</span>
            <span>{format(new Date(order.completedDate), "dd/MM/yyyy HH:mm")}</span>
          </div>
        )}
        {order.deliveredDate && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Entrega</span>
            <span>{format(new Date(order.deliveredDate), "dd/MM/yyyy HH:mm")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Garantia ──

interface OrderWarrantyCardProps {
  isWarranty: boolean;
  warrantyType?: string | null;
  warrantyMonths: number;
}

export function OrderWarrantyCard(order: OrderWarrantyCardProps) {
  return (
    <div className={SECTION_CARD}>
      <h3 className={SECTION_TITLE}>Garantia</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Garantia</span><span>{order.isWarranty ? "Sim" : "Nao"}</span></div>
        {order.warrantyType && <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span>{WARRANTY_TYPE_LABELS[order.warrantyType] ?? order.warrantyType}</span></div>}
        <div className="flex justify-between"><span className="text-muted-foreground">Prazo</span><span>{order.warrantyMonths} meses</span></div>
      </div>
    </div>
  );
}

// ── Termos (texto configurado em Configurações > Assistência) ──

interface OrderTermsCardProps {
  termsOfService?: string | null;
  warrantyPolicy?: string | null;
}

export function OrderTermsCard(order: OrderTermsCardProps) {
  if (!order.termsOfService && !order.warrantyPolicy) return null;
  return (
    <div className={SECTION_CARD}>
      <h3 className={SECTION_TITLE}>Termos</h3>
      <div className="space-y-3 text-sm">
        {order.termsOfService && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">Termos de servico</p>
            <p className="whitespace-pre-wrap text-xs leading-relaxed">{order.termsOfService}</p>
          </div>
        )}
        {order.warrantyPolicy && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">Politica de garantia</p>
            <p className="whitespace-pre-wrap text-xs leading-relaxed">{order.warrantyPolicy}</p>
          </div>
        )}
      </div>
    </div>
  );
}
