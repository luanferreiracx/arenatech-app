"use client";

import { Building2, IdCard, KeyRound, Mail, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PixKeyType } from "@/lib/utils/pix-detect";

interface PixKeyTypeTabsProps {
  value: PixKeyType;
  onChange: (type: PixKeyType) => void;
  className?: string;
}

const TYPES: Array<{ type: PixKeyType; label: string; Icon: typeof IdCard }> = [
  { type: "CPF", label: "CPF", Icon: IdCard },
  { type: "CNPJ", label: "CNPJ", Icon: Building2 },
  { type: "EMAIL", label: "E-mail", Icon: Mail },
  { type: "PHONE", label: "Telefone", Icon: Smartphone },
  { type: "RANDOM", label: "Aleatoria", Icon: KeyRound },
];

/**
 * Tabs visuais grandes pros 5 tipos de chave PIX. Cada botao tem icone +
 * label. Mobile: grid 3 + 2 (ultimas duas na linha de baixo).
 */
export function PixKeyTypeTabs({ value, onChange, className }: PixKeyTypeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Tipo de chave PIX"
      className={cn(
        "grid grid-cols-3 sm:grid-cols-5 gap-2",
        className,
      )}
    >
      {TYPES.map(({ type, label, Icon }) => {
        const isActive = value === type;
        return (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(type)}
            className={cn(
              "group relative flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-3 transition-all duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isActive
                ? "border-primary bg-primary/8 text-primary shadow-[0_0_0_3px_var(--primary)]/10"
                : "border-border bg-card hover:border-primary/40 hover:bg-muted/50 text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5 transition-transform",
                isActive && "scale-110",
              )}
              strokeWidth={isActive ? 2.25 : 1.75}
            />
            <span className="text-xs font-medium">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
