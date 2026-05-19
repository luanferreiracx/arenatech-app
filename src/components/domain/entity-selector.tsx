"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface EntitySelectorProps<T> {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Called with the full entity object when an item is selected (not on deselect). */
  onSelect?: (item: T) => void;
  searchFn: (query: string) => Promise<T[]>;
  getOptionLabel: (item: T) => string;
  getOptionValue: (item: T) => string;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  /** Rotulo inicial para exibir quando o `value` ja existe mas o entity ainda nao foi carregado. */
  initialLabel?: string | null;
}

export function EntitySelector<T>({
  value,
  onChange,
  onSelect,
  searchFn,
  getOptionLabel,
  getOptionValue,
  placeholder = "Selecionar...",
  emptyMessage = "Nenhum resultado.",
  className,
  initialLabel,
}: EntitySelectorProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(initialLabel ?? null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const results = await searchFn(q);
        setItems(results);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [searchFn]
  );

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void search(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, search]);

  // Derive label from items when available
  const derivedLabel = useMemo(() => {
    if (!value) return null;
    const found = items.find((item) => getOptionValue(item) === value);
    return found ? getOptionLabel(found) : null;
  }, [value, items, getOptionLabel, getOptionValue]);

  const displayLabel = derivedLabel ?? selectedLabel ?? initialLabel ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", !displayLabel && "text-muted-foreground", className)}
        >
          {displayLabel ?? placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : (
              <CommandGroup>
                {items.map((item) => {
                  const itemValue = getOptionValue(item);
                  return (
                    <CommandItem
                      key={itemValue}
                      value={itemValue}
                      onSelect={() => {
                        if (itemValue === value) {
                          onChange(undefined);
                          setSelectedLabel(null);
                        } else {
                          onChange(itemValue);
                          setSelectedLabel(getOptionLabel(item));
                          onSelect?.(item);
                        }
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === itemValue ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {getOptionLabel(item)}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
