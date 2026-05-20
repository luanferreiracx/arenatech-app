"use client";

import { createElement } from "react";
import {
  PlayCircle,
  Search,
  Clock,
  CheckCircle2,
  Package,
  Wrench,
  CheckCheck,
  DollarSign,
  Handshake,
  ShieldCheck,
  XCircle,
  Undo2,
  Circle,
  Check,
  type LucideIcon,
} from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  SERVICE_ORDER_STATUS_LABELS,
  SERVICE_ORDER_STATUS_VARIANT,
  SERVICE_ORDER_STATUS_ICON,
  STATUS_FLOW,
  OPTIONAL_STATUSES,
  SPECIAL_STATUSES,
  type ServiceOrderStatus,
} from "@/lib/validators/service-order";

const ICON_REGISTRY: Record<string, LucideIcon> = {
  PlayCircle,
  Search,
  Clock,
  CheckCircle2,
  Package,
  Wrench,
  CheckCheck,
  DollarSign,
  Handshake,
  ShieldCheck,
  XCircle,
  Undo2,
};

function iconFor(status: ServiceOrderStatus): LucideIcon {
  return ICON_REGISTRY[SERVICE_ORDER_STATUS_ICON[status]] ?? Circle;
}

/**
 * Stepper visual do status da OS — paridade visual com Laravel:
 * - circulos com icones FontAwesome (lucide equivalentes)
 * - barra de progresso entre eles
 * - tooltip com nome completo no hover
 * - status especiais (CANCELLED/REFUNDED/IN_WARRANTY) mostram badge centrado
 */
export function StatusStepper({ status }: { status: ServiceOrderStatus }) {
  const isSpecial = SPECIAL_STATUSES.includes(status);
  const currentIndex = STATUS_FLOW.indexOf(status);

  if (isSpecial) {
    return (
      <div className="flex items-center justify-center gap-2 py-6">
        {createElement(iconFor(status), { className: "h-5 w-5" })}
        <StatusBadge variant={SERVICE_ORDER_STATUS_VARIANT[status]} className="text-base px-4 py-2">
          {SERVICE_ORDER_STATUS_LABELS[status]}
        </StatusBadge>
      </div>
    );
  }

  // Progresso em % (0 a 100) baseado na posicao no fluxo
  const progress =
    currentIndex >= 0 ? (currentIndex / (STATUS_FLOW.length - 1)) * 100 : 0;

  return (
    <div className="relative w-full">
      {/* Linha de fundo (cinza) */}
      <div className="absolute top-4 left-4 right-4 h-0.5 bg-border" aria-hidden />
      {/* Linha preenchida (progresso) */}
      <div
        className="absolute top-4 left-4 h-0.5 bg-success transition-all"
        style={{ width: `calc((100% - 2rem) * ${progress / 100})` }}
        aria-hidden
      />

      <ol className="relative flex items-start justify-between gap-1 overflow-x-auto pb-2">
        {STATUS_FLOW.map((s, i) => {
          const isCompleted = currentIndex >= 0 && i < currentIndex;
          const isCurrent = i === currentIndex;
          const isOptional = OPTIONAL_STATUSES.includes(s);
          const label = SERVICE_ORDER_STATUS_LABELS[s];

          return (
            <li
              key={s}
              className={`flex flex-col items-center min-w-[64px] ${isOptional ? "opacity-70" : ""}`}
              title={label}
              aria-current={isCurrent ? "step" : undefined}
            >
              <div
                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors bg-background ${
                  isCompleted
                    ? "bg-success border-success text-white"
                    : isCurrent
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-muted-foreground"
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : createElement(iconFor(s), { className: "w-4 h-4" })}
              </div>
              <span
                className={`text-[10px] mt-1 text-center leading-tight px-1 ${
                  isCurrent ? "text-primary font-semibold" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
