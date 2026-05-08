"use client";

import { type ComponentProps, forwardRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ViaCEPResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

type CepInputProps = Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  value?: string;
  onValueChange?: (raw: string) => void;
  onAddressFound?: (address: ViaCEPResponse) => void;
};

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export const CepInput = forwardRef<HTMLInputElement, CepInputProps>(
  function CepInput({ value = "", onValueChange, onAddressFound, className, ...props }, ref) {
    const [loading, setLoading] = useState(false);

    const handleBlur = async () => {
      const digits = value.replace(/\D/g, "");
      if (digits.length !== 8 || !onAddressFound) return;

      setLoading(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        if (res.ok) {
          const data = (await res.json()) as ViaCEPResponse;
          if (!data.erro) {
            onAddressFound(data);
          }
        }
      } catch {
        // Silently fail — user can fill manually
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type="text"
          inputMode="numeric"
          maxLength={9}
          value={formatCep(value)}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
            onValueChange?.(raw);
          }}
          onBlur={handleBlur}
          placeholder="00000-000"
          className={cn(loading && "pr-9", className)}
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    );
  }
);
