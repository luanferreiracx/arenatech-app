"use client";

import { type ComponentProps, forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function formatMoney(centavos: number): string {
  const value = centavos / 100;
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

type MoneyInputProps = Omit<ComponentProps<typeof Input>, "onChange" | "value" | "type"> & {
  value: number; // centavos
  onChange: (centavos: number) => void;
};

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput({ value, onChange, className, ...props }, ref) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, "");
      const centavos = digits === "" ? 0 : parseInt(digits, 10);
      onChange(centavos);
    };

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        value={formatMoney(value)}
        onChange={handleChange}
        className={cn("font-mono", className)}
      />
    );
  }
);
