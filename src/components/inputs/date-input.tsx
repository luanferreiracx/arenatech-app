"use client";

import { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * DateInput — drop-in replacement do `<Input type="date">` nativo.
 *
 * Vantagens sobre o nativo:
 *  - formato dd/MM/yyyy consistente entre browsers/locale (nativo varia)
 *  - calendario shadcn com localizacao PT-BR
 *  - aria-label/label correto pra screen readers
 *
 * API: value e onChange em formato ISO `YYYY-MM-DD` (mesmo do input nativo),
 * facilitando migracao sem mexer em zod schemas/forms ja existentes.
 *
 * Para limpar a selecao, chame onChange("").
 */
interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  "aria-label"?: string;
  id?: string;
  required?: boolean;
  /**
   * Quando true, mostra dropdowns de mes e ano no header do calendario
   * (em vez de so navegar mes-a-mes). Util pra datas de nascimento onde
   * o operador precisa voltar 30+ anos rapido.
   */
  yearDropdown?: boolean;
  /** Ano minimo no dropdown. Default 1925 quando yearDropdown=true. */
  fromYear?: number;
  /** Ano maximo no dropdown. Default ano atual quando yearDropdown=true. */
  toYear?: number;
}

function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  // Aceita "YYYY-MM-DD" e "YYYY-MM-DDTHH:mm:ss..." (corta a parte da data).
  const dateOnly = iso.slice(0, 10);
  const parsed = parse(dateOnly, "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : undefined;
}

function dateToIso(date: Date | undefined): string {
  if (!date) return "";
  return format(date, "yyyy-MM-dd");
}

export function DateInput({
  value,
  onChange,
  placeholder = "Selecionar data",
  className,
  disabled,
  min,
  max,
  id,
  required,
  yearDropdown,
  fromYear,
  toYear,
  ...rest
}: DateInputProps) {
  const [open, setOpen] = useState(false);
  const selected = isoToDate(value);
  const minDate = isoToDate(min ?? "");
  const maxDate = isoToDate(max ?? "");

  const currentYear = new Date().getFullYear();
  const resolvedFromYear = fromYear ?? 1925;
  const resolvedToYear = toYear ?? currentYear;
  const startMonth = new Date(resolvedFromYear, 0, 1);
  const endMonth = new Date(resolvedToYear, 11, 31);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={rest["aria-label"] ?? placeholder}
          aria-required={required || undefined}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? format(selected, "dd/MM/yyyy", { locale: ptBR }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(dateToIso(date));
            setOpen(false);
          }}
          locale={ptBR}
          initialFocus
          captionLayout={yearDropdown ? "dropdown" : "label"}
          startMonth={yearDropdown ? startMonth : undefined}
          endMonth={yearDropdown ? endMonth : undefined}
          defaultMonth={selected ?? (yearDropdown ? new Date(currentYear - 30, 0, 1) : undefined)}
          disabled={(date) => {
            if (minDate && date < minDate) return true;
            if (maxDate && date > maxDate) return true;
            return false;
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
