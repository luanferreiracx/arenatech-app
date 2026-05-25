"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Seletor de destinatario WhatsApp pra envio de recibo/termo/etc.
 * Paridade Laravel `modal-whatsapp-envio.blade.php`: lista telefones
 * cadastrados como radio + opcao "Outro numero" pra digitar.
 *
 * Aceita varias fontes (cliente principal, alternativo, secundario do PDV
 * ou OS). Quando nao ha telefones, mostra mensagem + campo manual.
 */

export interface PhoneOption {
  label: string;
  value: string; // so digitos, ou ja formatado
}

interface Props {
  options: PhoneOption[];
  /** Valor selecionado (formato livre — operador pode digitar). */
  value: string;
  onValueChange: (v: string) => void;
  /** Quando true, mostra mensagem amigavel + campo manual quando vazio. */
  showEmptyState?: boolean;
}

function formatPhoneBR(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function WhatsappRecipientPicker({
  options,
  value,
  onValueChange,
  showEmptyState = true,
}: Props) {
  // Deduplica opcoes por valor digit-only.
  const dedupedOptions = useMemo(() => {
    const seen = new Set<string>();
    return options.filter((o) => {
      const digits = o.value.replace(/\D/g, "");
      if (!digits || seen.has(digits)) return false;
      seen.add(digits);
      return true;
    });
  }, [options]);

  // Estado: qual radio esta selecionado. "custom" = campo manual.
  const matchOption = (v: string) => {
    const d = v.replace(/\D/g, "");
    return dedupedOptions.find((o) => o.value.replace(/\D/g, "") === d);
  };

  const initial = matchOption(value);
  const [selected, setSelected] = useState<string>(
    initial ? initial.value : dedupedOptions[0]?.value ?? "custom",
  );
  const [customInput, setCustomInput] = useState<string>(
    !initial && value ? formatPhoneBR(value) : "",
  );

  // Sincroniza valor pra fora.
  useEffect(() => {
    if (selected === "custom") {
      onValueChange(customInput);
    } else {
      onValueChange(selected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, customInput]);

  if (dedupedOptions.length === 0 && showEmptyState) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-900 dark:text-yellow-200">
          Sem telefones cadastrados. Digite um numero abaixo.
        </div>
        <Label htmlFor="customPhone">Numero (WhatsApp)</Label>
        <Input
          id="customPhone"
          value={customInput}
          onChange={(e) => {
            setSelected("custom");
            setCustomInput(formatPhoneBR(e.target.value));
          }}
          placeholder="(00) 00000-0000"
          inputMode="numeric"
          maxLength={15}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Enviar para</Label>
      <div className="space-y-1.5">
        {dedupedOptions.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40"
          >
            <input
              type="radio"
              name="wa-recipient"
              value={opt.value}
              checked={selected === opt.value}
              onChange={() => setSelected(opt.value)}
              className="accent-primary"
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">{opt.label}</div>
              <div className="text-sm font-mono">{formatPhoneBR(opt.value)}</div>
            </div>
          </label>
        ))}
        <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40">
          <input
            type="radio"
            name="wa-recipient"
            value="custom"
            checked={selected === "custom"}
            onChange={() => setSelected("custom")}
            className="accent-primary"
          />
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Outro numero</div>
            <Input
              value={customInput}
              onChange={(e) => {
                setSelected("custom");
                setCustomInput(formatPhoneBR(e.target.value));
              }}
              onFocus={() => setSelected("custom")}
              placeholder="(00) 00000-0000"
              inputMode="numeric"
              maxLength={15}
              className="mt-1 h-8"
            />
          </div>
        </label>
      </div>
    </div>
  );
}
