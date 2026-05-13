"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/inputs/money-input";
import { toast } from "@/lib/toast";
import {
  CHECKLIST_TEMPLATES,
  CATEGORY_TO_TEMPLATE,
  DEVICE_CATEGORIES,
  type ChecklistField,
} from "./checklist-templates";

type Step = "select" | "fill" | "laudo";

interface DeviceInfo {
  categoria: string;
  modelo: string;
  imei: string;
}

export function ChecklistFlow() {
  const [step, setStep] = useState<Step>("select");
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({ categoria: "", modelo: "", imei: "" });
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
  const [valorOferecido, setValorOferecido] = useState(0);
  const [observacoesAvaliador, setObservacoesAvaliador] = useState("");
  const [finalizado, setFinalizado] = useState(false);

  const templateKey = CATEGORY_TO_TEMPLATE[deviceInfo.categoria] ?? "smartphone";
  const template = CHECKLIST_TEMPLATES[templateKey] ?? CHECKLIST_TEMPLATES.smartphone!;

  const handleStartChecklist = () => {
    if (!deviceInfo.categoria || !deviceInfo.modelo) {
      toast.error("Preencha tipo e modelo do aparelho");
      return;
    }
    setStep("fill");
  };

  const handleFinishChecklist = () => {
    // Validate required fields
    for (const campo of template.campos) {
      if (campo.obrigatorio && !answers[campo.id]) {
        toast.error(`Campo obrigatorio: ${campo.label}`);
        return;
      }
    }
    setStep("laudo");
  };

  const handleFinalizeLaudo = () => {
    setFinalizado(true);
    toast.success("Laudo finalizado com sucesso!");
  };

  const handleReset = () => {
    setStep("select");
    setDeviceInfo({ categoria: "", modelo: "", imei: "" });
    setAnswers({});
    setValorOferecido(0);
    setObservacoesAvaliador("");
    setFinalizado(false);
  };

  const handlePrint = () => {
    window.print();
  };

  const updateAnswer = (fieldId: string, value: string | string[] | number) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  };

  const toggleCheckbox = (fieldId: string, option: string) => {
    const current = (answers[fieldId] as string[] | undefined) ?? [];
    const newValue = current.includes(option)
      ? current.filter((v) => v !== option)
      : [...current, option];
    updateAnswer(fieldId, newValue);
  };

  // ── STEP 1: Select device ──
  if (step === "select") {
    return (
      <Card className="p-6 max-w-2xl">
        <div className="bg-primary/10 border-l-4 border-primary p-4 rounded-r mb-6">
          <p className="text-sm">
            <strong>Instrucoes:</strong> Preencha os dados do aparelho a ser avaliado.
            Apos enviar, voce sera direcionado para o checklist de inspecao especifico
            do tipo de aparelho selecionado.
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Tipo de Aparelho <span className="text-destructive">*</span></Label>
              <Select
                value={deviceInfo.categoria}
                onValueChange={(v) => setDeviceInfo((prev) => ({ ...prev, categoria: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_CATEGORIES.map((group) => (
                    <div key={group.group}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {group.group}
                      </div>
                      {group.items.map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modelo / Marca <span className="text-destructive">*</span></Label>
              <Input
                value={deviceInfo.modelo}
                onChange={(e) => setDeviceInfo((prev) => ({ ...prev, modelo: e.target.value }))}
                placeholder="Ex: iPhone 13 Pro Max, Samsung Galaxy S21, etc."
              />
            </div>
          </div>
          <div>
            <Label>IMEI / Numero de Serie</Label>
            <Input
              value={deviceInfo.imei}
              onChange={(e) => setDeviceInfo((prev) => ({ ...prev, imei: e.target.value }))}
              placeholder="Digite o IMEI ou Numero de Serie"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Para smartphones, o IMEI possui 15 digitos.
            </p>
          </div>

          <Button onClick={handleStartChecklist}>
            <ArrowRight className="mr-2 h-4 w-4" />
            Continuar para Checklist
          </Button>
        </div>
      </Card>
    );
  }

  // ── STEP 2: Fill checklist ──
  if (step === "fill") {
    return (
      <div className="space-y-4 max-w-3xl">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{template.titulo}</h3>
              <p className="text-sm text-muted-foreground">
                {deviceInfo.categoria} — {deviceInfo.modelo}
                {deviceInfo.imei && ` — IMEI: ${deviceInfo.imei}`}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStep("select")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </div>
        </Card>

        {template.campos.map((campo) => (
          <Card key={campo.id} className="p-4">
            <Label className="text-sm font-medium">
              {campo.label}
              {campo.obrigatorio && <span className="text-destructive ml-1">*</span>}
            </Label>
            {campo.descricao && (
              <p className="text-xs text-muted-foreground mt-1">{campo.descricao}</p>
            )}
            <div className="mt-2">
              <ChecklistFieldInput
                field={campo}
                value={answers[campo.id]}
                onChange={(v) => updateAnswer(campo.id, v)}
                onToggleCheckbox={(opt) => toggleCheckbox(campo.id, opt)}
              />
            </div>
          </Card>
        ))}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep("select")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <Button onClick={handleFinishChecklist}>
            <ArrowRight className="mr-2 h-4 w-4" />
            Ir para Laudo
          </Button>
        </div>
      </div>
    );
  }

  // ── STEP 3: Laudo ──
  return (
    <div className="space-y-4 max-w-3xl print:max-w-full">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Laudo de Avaliacao</h3>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Nova Avaliacao
            </Button>
          </div>
        </div>

        {/* Device info */}
        <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
          <div>
            <span className="text-xs text-muted-foreground">Tipo</span>
            <p className="font-medium">{deviceInfo.categoria}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Modelo</span>
            <p className="font-medium">{deviceInfo.modelo}</p>
          </div>
          {deviceInfo.imei && (
            <div>
              <span className="text-xs text-muted-foreground">IMEI / Serie</span>
              <p className="font-medium">{deviceInfo.imei}</p>
            </div>
          )}
        </div>

        {/* Checklist results */}
        <div className="space-y-2 mb-6">
          <h4 className="font-medium text-sm text-muted-foreground uppercase">Resultado do Checklist</h4>
          {template.campos.map((campo) => {
            const answer = answers[campo.id];
            if (!answer) return null;
            const displayValue = Array.isArray(answer) ? answer.join(", ") : String(answer);
            return (
              <div key={campo.id} className="flex justify-between py-1 border-b border-muted">
                <span className="text-sm">{campo.label}</span>
                <span className="text-sm font-medium">{displayValue}</span>
              </div>
            );
          })}
        </div>

        {/* Valor oferecido */}
        {!finalizado && (
          <div className="space-y-4 print:hidden border-t pt-4">
            <div>
              <Label>Valor Oferecido</Label>
              <MoneyInput value={valorOferecido} onChange={setValorOferecido} />
            </div>
            <div>
              <Label>Observacoes do Avaliador</Label>
              <Textarea
                value={observacoesAvaliador}
                onChange={(e) => setObservacoesAvaliador(e.target.value)}
                placeholder="Observacoes adicionais..."
              />
            </div>
            <Button onClick={handleFinalizeLaudo}>
              <Check className="mr-2 h-4 w-4" />
              Finalizar Laudo
            </Button>
          </div>
        )}

        {finalizado && (
          <div className="border-t pt-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <p className="font-semibold text-green-400">Laudo Finalizado</p>
              {valorOferecido > 0 && (
                <p className="text-lg font-bold mt-2">
                  Valor Oferecido: {(valorOferecido / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              )}
              {observacoesAvaliador && (
                <p className="text-sm mt-2">{observacoesAvaliador}</p>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Field Renderer ──

function ChecklistFieldInput({
  field,
  value,
  onChange,
  onToggleCheckbox,
}: {
  field: ChecklistField;
  value: string | string[] | number | undefined;
  onChange: (v: string | number) => void;
  onToggleCheckbox: (opt: string) => void;
}) {
  switch (field.tipo) {
    case "radio":
      return (
        <div className="flex flex-wrap gap-2">
          {field.opcoes?.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                value === opt
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 hover:bg-muted border-border"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      );
    case "checkbox":
      return (
        <div className="flex flex-wrap gap-2">
          {field.opcoes?.map((opt) => {
            const checked = Array.isArray(value) && value.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onToggleCheckbox(opt)}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  checked
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 hover:bg-muted border-border"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    case "text":
      return (
        <Input
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );
    case "textarea":
      return (
        <Textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={(value as number) ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          min={field.min}
          max={field.max}
        />
      );
    default:
      return null;
  }
}
