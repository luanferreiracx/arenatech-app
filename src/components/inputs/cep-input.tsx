"use client";

import { type ComponentProps, forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchAddressByCep, isViaCEPError, type AddressResult } from "@/lib/integrations/viacep";

export type { AddressResult };

type CepInputProps = Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  value?: string;
  onValueChange?: (raw: string) => void;
  onAddressFound?: (address: AddressResult) => void;
};

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export const CepInput = forwardRef<HTMLInputElement, CepInputProps>(
  function CepInput({ value = "", onValueChange, onAddressFound, className, ...props }, ref) {
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const lookup = useCallback(
      async (digits: string) => {
        if (digits.length !== 8 || !onAddressFound) return;

        setLoading(true);
        setErrorMsg(null);

        const result = await fetchAddressByCep(digits);

        if (isViaCEPError(result)) {
          setErrorMsg(result.error);
        } else {
          onAddressFound(result);
        }

        setLoading(false);
      },
      [onAddressFound],
    );

    useEffect(() => {
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
      onValueChange?.(raw);
      setErrorMsg(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (raw.length === 8) {
        debounceRef.current = setTimeout(() => {
          void lookup(raw);
        }, 500);
      }
    };

    return (
      <div className="space-y-1">
        <div className="relative">
          <Input
            {...props}
            ref={ref}
            type="text"
            inputMode="numeric"
            maxLength={9}
            value={formatCep(value)}
            onChange={handleChange}
            placeholder="00000-000"
            className={cn(loading && "pr-9", className)}
          />
          {loading && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
        {errorMsg && (
          <p className="text-xs text-muted-foreground">{errorMsg}</p>
        )}
      </div>
    );
  }
);
