"use client";

import { useCallback } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { DateInput } from "@/components/inputs/date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntitySelector } from "@/components/domain/entity-selector";
import { WARRANTY_TYPE_LABELS } from "@/lib/validators/service-order";
import type { CreateServiceOrderInput } from "@/lib/validators/service-order";

interface Props {
  data: Partial<CreateServiceOrderInput>;
  onChange: (patch: Partial<CreateServiceOrderInput>) => void;
}

interface UserOption {
  id: string;
  name: string;
  role: string;
}

// Responsável da OS: técnico interno ("user") ou prestador externo ("provider").
interface AssigneeOption {
  id: string;
  name: string;
  role: string | null;
  kind: "user" | "provider";
}

export function StepSummary({ data, onChange }: Props) {
  const trpc = useTRPC();
  const techQuery = useQuery(
    trpc.serviceOrder.listTechnicianAssignees.queryOptions()
  );
  const technicians = techQuery.data;
  const vendorQuery = useQuery(
    trpc.serviceOrder.listVendors.queryOptions()
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendors = vendorQuery.data as UserOption[] | undefined;

  // Valor selecionado no formato "kind:id" — distingue user de prestador.
  const selectedAssignee = data.serviceProviderId
    ? `provider:${data.serviceProviderId}`
    : data.technicianId
      ? `user:${data.technicianId}`
      : undefined;

  const searchTechnicians = useCallback(
    async (query: string): Promise<AssigneeOption[]> => {
      if (!technicians) return [];
      const q = query.toLowerCase();
      return technicians.filter((t) => t.name.toLowerCase().includes(q));
    },
    [technicians]
  );

  const searchVendors = useCallback(
    async (query: string): Promise<UserOption[]> => {
      if (!vendors) return [];
      const q = query.toLowerCase();
      return vendors.filter((v) => v.name.toLowerCase().includes(q));
    },
    [vendors]
  );

  const total = (data.items ?? []).reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Resumo e Responsaveis</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Technician — obrigatório (técnico interno ou prestador externo) */}
        <div className="space-y-2">
          <Label>
            Tecnico Responsavel <span className="text-destructive">*</span>
          </Label>
          <EntitySelector<AssigneeOption>
            value={selectedAssignee}
            onChange={(val) => {
              if (!val) {
                onChange({ technicianId: null, serviceProviderId: null });
                return;
              }
              const sep = val.indexOf(":");
              const kind = val.slice(0, sep);
              const id = val.slice(sep + 1);
              // FKs exclusivos: técnico interno limpa prestador e vice-versa.
              onChange(
                kind === "provider"
                  ? { serviceProviderId: id, technicianId: null }
                  : { technicianId: id, serviceProviderId: null },
              );
            }}
            searchFn={searchTechnicians}
            getOptionLabel={(u) => (u.kind === "provider" ? `${u.name} (prestador)` : u.name)}
            getOptionValue={(u) => `${u.kind}:${u.id}`}
            placeholder="Selecionar responsavel..."
            emptyMessage="Nenhum tecnico disponivel. Cadastre um usuario com a funcao Tecnico em Configuracoes > Usuarios, ou um prestador-tecnico."
          />
          <p className="text-xs text-muted-foreground">
            Obrigatorio. Pode ser trocado depois na propria OS.
          </p>
        </div>

        {/* Vendor */}
        <div className="space-y-2">
          <Label>Vendedor Intermediador</Label>
          <EntitySelector<UserOption>
            value={data.vendorId ?? undefined}
            onChange={(val) => onChange({ vendorId: val })}
            searchFn={searchVendors}
            getOptionLabel={(u) => u.name}
            getOptionValue={(u) => u.id}
            placeholder="Selecionar vendedor..."
            emptyMessage="Nenhum vendedor encontrado."
          />
        </div>
      </div>

      {/* Garantia (configurada no step Equipamento) — resumo readonly */}
      {data.isWarranty && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
          <p className="text-sm font-semibold text-warning mb-2">OS de Garantia / Retorno</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Tipo</p>
              <p>{WARRANTY_TYPE_LABELS[data.warrantyType ?? "return"]}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">OS Original</p>
              <p>{data.originalOrderId ? "Vinculada" : "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Prazo</p>
              <p>{data.warrantyMonths ?? 3} meses</p>
            </div>
          </div>
        </div>
      )}

      {/* Notes & Estimated Date */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Data Prevista de Entrega</Label>
          <DateInput
            value={data.estimatedDate ?? ""}
            onChange={(v) => onChange({ estimatedDate: v || null })}
            aria-label="Data prevista de entrega"
          />
        </div>
        <div className="space-y-2">
          <Label>Observacoes para o Cliente</Label>
          <Textarea
            value={data.customerNotes ?? ""}
            onChange={(e) => onChange({ customerNotes: e.target.value || null })}
            placeholder="Informacoes visiveis na pagina publica..."
            rows={2}
          />
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <h4 className="font-semibold mb-3">Resumo da OS</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Cliente</p>
            <p className="font-medium">{data.customerId ? "Selecionado" : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Equipamento</p>
            <p className="font-medium">
              {[data.deviceType, data.deviceModel].filter(Boolean).join(" ") || "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Itens</p>
            <p className="font-medium">{(data.items ?? []).length} ite(ns)</p>
          </div>
          <div>
            <p className="text-muted-foreground">Valor Total</p>
            <p className="font-bold text-primary font-mono">
              {(total / 100).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
