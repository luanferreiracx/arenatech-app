"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CHECKLIST_ITEMS,
  DEVICE_INFO_ITEMS,
  type ChecklistData,
  type DeviceInfoData,
} from "@/lib/validators/service-order";
import type { CreateServiceOrderInput } from "@/lib/validators/service-order";

interface Props {
  data: Partial<CreateServiceOrderInput>;
  onChange: (patch: Partial<CreateServiceOrderInput>) => void;
}

function ChecklistToggle({
  value,
  onToggle,
}: {
  value: boolean | null | undefined;
  onToggle: (next: boolean | null) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onToggle(value === true ? null : true)}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded border transition-colors",
          value === true
            ? "bg-success/20 border-success text-success"
            : "border-border text-muted-foreground hover:border-success/50"
        )}
        title="OK"
      >
        <Check className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onToggle(value === false ? null : false)}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded border transition-colors",
          value === false
            ? "bg-destructive/20 border-destructive text-destructive"
            : "border-border text-muted-foreground hover:border-destructive/50"
        )}
        title="Nao OK"
      >
        <X className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onToggle(null)}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded border transition-colors",
          value === null || value === undefined
            ? "bg-muted border-muted-foreground/30 text-muted-foreground"
            : "border-border text-muted-foreground hover:border-muted-foreground/50"
        )}
        title="N/A"
      >
        <Minus className="w-4 h-4" />
      </button>
    </div>
  );
}

export function StepProblem({ data, onChange }: Props) {
  const checklist = (data.entryChecklist ?? {}) as ChecklistData;
  const deviceInfo = (data.deviceInfo ?? {}) as DeviceInfoData;

  const updateChecklist = (key: keyof ChecklistData, value: boolean | null) => {
    onChange({
      entryChecklist: { ...checklist, [key]: value },
    });
  };

  const toggleDeviceInfo = (key: keyof DeviceInfoData) => {
    onChange({
      deviceInfo: { ...deviceInfo, [key]: !deviceInfo[key] },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Problema Relatado</h3>
        <Textarea
          value={data.reportedProblem ?? ""}
          onChange={(e) => onChange({ reportedProblem: e.target.value })}
          placeholder="Descreva o problema relatado pelo cliente..."
          rows={3}
          required
        />
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Checklist de Entrada</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Marque o estado de cada item: <Check className="w-3 h-3 inline text-success" /> OK,{" "}
          <X className="w-3 h-3 inline text-destructive" /> Nao OK,{" "}
          <Minus className="w-3 h-3 inline text-muted-foreground" /> N/A
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CHECKLIST_ITEMS.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <Label className="text-sm font-normal">{item.label}</Label>
              <ChecklistToggle
                value={checklist[item.key]}
                onToggle={(v) => updateChecklist(item.key, v)}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Informacoes Adicionais</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEVICE_INFO_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
            >
              <input
                type="checkbox"
                checked={!!deviceInfo[item.key]}
                onChange={() => toggleDeviceInfo(item.key)}
                className="w-4 h-4 rounded accent-primary"
              />
              <span className="text-sm">{item.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
