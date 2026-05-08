"use client";

import { type ComponentProps, forwardRef } from "react";
import { Input } from "@/components/ui/input";

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  // Detect by 9th digit: 11+ digits = celular, <11 = fixo
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  // 11 digits = celular: (xx) 9xxxx-xxxx
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

type PhoneInputProps = Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  value?: string;
  onValueChange?: (raw: string) => void;
};

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput({ value = "", onValueChange, ...props }, ref) {
    return (
      <Input
        {...props}
        ref={ref}
        type="tel"
        inputMode="numeric"
        maxLength={16}
        value={formatPhone(value)}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
          onValueChange?.(raw);
        }}
        placeholder="(00) 00000-0000"
      />
    );
  }
);
