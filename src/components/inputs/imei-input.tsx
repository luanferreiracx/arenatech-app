"use client";

import { type ComponentProps, forwardRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { isValidLuhn } from "@/lib/validators/imei";
import { cn } from "@/lib/utils";

type ImeiInputProps = Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  value?: string;
  onValueChange?: (raw: string) => void;
  /** Quando true, suprime o feedback de erro (util quando o campo e opcional e vazio). */
  silentWhenEmpty?: boolean;
};

/**
 * Input para IMEI: aceita apenas digitos, max 15. Mostra borda vermelha + mensagem
 * abaixo se o valor tem 15 digitos mas falha na validacao Luhn. Em formularios
 * onde IMEI e opcional, deixar o campo vazio nao dispara erro.
 */
export const ImeiInput = forwardRef<HTMLInputElement, ImeiInputProps>(
  function ImeiInput({ value = "", onValueChange, silentWhenEmpty = true, className, ...props }, ref) {
    const digits = useMemo(() => value.replace(/\D/g, "").slice(0, 15), [value]);
    const showError = useMemo(() => {
      if (digits.length === 0 && silentWhenEmpty) return false;
      if (digits.length === 0) return true;
      if (digits.length < 15) return true;
      return !isValidLuhn(digits);
    }, [digits, silentWhenEmpty]);

    return (
      <div className="space-y-1">
        <Input
          {...props}
          ref={ref}
          type="text"
          inputMode="numeric"
          maxLength={15}
          value={digits}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "").slice(0, 15);
            onValueChange?.(raw);
          }}
          placeholder="000000000000000"
          className={cn(showError && digits.length > 0 && "border-destructive focus-visible:ring-destructive", className)}
        />
        {showError && digits.length > 0 && (
          <p className="text-xs text-destructive">
            {digits.length < 15 ? `IMEI incompleto (${digits.length}/15)` : "IMEI invalido (falha Luhn)"}
          </p>
        )}
      </div>
    );
  },
);
