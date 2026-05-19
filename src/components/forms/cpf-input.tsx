"use client";

import { Input } from "@/components/ui/input";
import { type ComponentProps, forwardRef } from "react";

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

type CpfInputProps = Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  value?: string;
  onValueChange?: (raw: string) => void;
};

export const CpfInput = forwardRef<HTMLInputElement, CpfInputProps>(
  function CpfInput({ value = "", onValueChange, ...props }, ref) {
    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        maxLength={14}
        value={formatCpf(value)}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
          onValueChange?.(raw);
        }}
        placeholder="000.000.000-00"
      />
    );
  },
);
