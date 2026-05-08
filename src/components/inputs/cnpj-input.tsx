"use client";

import { type ComponentProps, forwardRef } from "react";
import { Input } from "@/components/ui/input";

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

type CnpjInputProps = Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  value?: string;
  onValueChange?: (raw: string) => void;
};

export const CnpjInput = forwardRef<HTMLInputElement, CnpjInputProps>(
  function CnpjInput({ value = "", onValueChange, ...props }, ref) {
    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        maxLength={18}
        value={formatCnpj(value)}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "").slice(0, 14);
          onValueChange?.(raw);
        }}
        placeholder="00.000.000/0000-00"
      />
    );
  }
);
