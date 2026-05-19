"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImeiInput } from "@/components/inputs/imei-input";
import { deviceTypeEnum } from "@/lib/validators/service-order";
import type { CreateServiceOrderInput } from "@/lib/validators/service-order";

interface Props {
  data: Partial<CreateServiceOrderInput>;
  onChange: (patch: Partial<CreateServiceOrderInput>) => void;
}

const DEVICE_TYPES = deviceTypeEnum.options;

export function StepDevice({ data, onChange }: Props) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Dados do Equipamento</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Tipo de Equipamento</Label>
          <Select
            value={data.deviceType ?? ""}
            onValueChange={(v) => onChange({ deviceType: v || null })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent>
              {DEVICE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Marca</Label>
          <Input
            value={data.deviceBrand ?? ""}
            onChange={(e) => onChange({ deviceBrand: e.target.value || null })}
            placeholder="Ex: Apple, Samsung..."
          />
        </div>

        <div className="space-y-2">
          <Label>Modelo</Label>
          <Input
            value={data.deviceModel ?? ""}
            onChange={(e) => onChange({ deviceModel: e.target.value || null })}
            placeholder="Ex: iPhone 15 Pro"
          />
        </div>

        <div className="space-y-2">
          <Label>Numero de Serie</Label>
          <Input
            value={data.serialNumber ?? ""}
            onChange={(e) => onChange({ serialNumber: e.target.value || null })}
            placeholder="Numero de serie"
          />
        </div>

        <div className="space-y-2">
          <Label>IMEI</Label>
          <ImeiInput
            value={data.imei ?? ""}
            onValueChange={(raw) => onChange({ imei: raw || null })}
          />
        </div>

        <div className="space-y-2">
          <Label>Senha do Equipamento</Label>
          <Input
            value={data.devicePassword ?? ""}
            onChange={(e) => onChange({ devicePassword: e.target.value || null })}
            placeholder="Senha / padrao de desbloqueio"
          />
        </div>

        <div className="space-y-2 md:col-span-3">
          <Label>Acessorios</Label>
          <Textarea
            value={data.accessories ?? ""}
            onChange={(e) => onChange({ accessories: e.target.value || null })}
            placeholder="Capa, pelicula, carregador, chip..."
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}
