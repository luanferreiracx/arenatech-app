"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  SERVICE_ORDER_STATUS_LABELS,
  type ServiceOrderStatus,
} from "@/lib/validators/service-order";

/**
 * Histórico de OS do MESMO aparelho (por IMEI/serial), dentro do detalhe da OS.
 * Reincidência de defeito e disputa de garantia dependem de ver "outras OS deste
 * aparelho" — padrão de assistência técnica. Só renderiza quando há identificador
 * e ao menos uma OS anterior.
 */
export function DeviceHistoryPanel({
  orderId,
  imei,
  serialNumber,
}: {
  orderId: string;
  imei?: string | null;
  serialNumber?: string | null;
}) {
  const trpc = useTRPC();
  const hasIdentifier = !!(imei?.trim() || serialNumber?.trim());

  const historyQuery = useQuery(
    trpc.serviceOrder.getDeviceHistoryByImei.queryOptions(
      {
        imei: imei?.trim() || undefined,
        serialNumber: serialNumber?.trim() || undefined,
        excludeOrderId: orderId,
      },
      { enabled: hasIdentifier },
    ),
  );

  const history = historyQuery.data ?? [];
  if (!hasIdentifier || history.length === 0) return null;

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <History className="h-4 w-4" />
        Histórico deste aparelho ({history.length})
      </h3>
      <ul className="divide-y divide-border">
        {history.map((os) => (
          <li key={os.id} className="py-2 first:pt-0 last:pb-0">
            <Link
              href={`/service-orders/${os.id}`}
              className="flex items-start justify-between gap-3 hover:bg-accent/40 -mx-2 px-2 py-1 rounded"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">OS {os.number}</span>
                  <StatusBadge variant="info">
                    {SERVICE_ORDER_STATUS_LABELS[os.status as ServiceOrderStatus] ?? os.status}
                  </StatusBadge>
                </div>
                {os.reportedProblem && (
                  <p className="truncate text-xs text-muted-foreground">{os.reportedProblem}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {os.entryDate ? format(new Date(os.entryDate), "dd/MM/yy", { locale: ptBR }) : "—"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
