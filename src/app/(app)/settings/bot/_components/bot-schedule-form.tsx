"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Clock } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { LoadingState } from "@/components/domain/loading-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  updateBotScheduleSchema,
  type UpdateBotScheduleInput,
  COMMON_TIMEZONES,
  WEEKDAY_LABELS,
  normalizeHhmm,
  DEFAULT_BOT_TIMEZONE,
  DEFAULT_BOT_OPEN_WEEKDAYS,
} from "@/lib/validators/bot-config";

export function BotScheduleForm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(trpc.settings.getBotSchedule.queryOptions());

  const form = useForm<UpdateBotScheduleInput>({
    resolver: zodResolver(updateBotScheduleSchema),
    // defaultValues garante que o Select do fuso já nasce CONTROLADO com um valor válido
    // (evita o gotcha do Radix uncontrolled→controlled, que deixava o fuso vazio + erro).
    // `values` sobrescreve quando a query carrega os dados reais da loja.
    defaultValues: {
      timezone: DEFAULT_BOT_TIMEZONE,
      start: null,
      end: null,
      openWeekdays: [...DEFAULT_BOT_OPEN_WEEKDAYS],
    },
    values: data
      ? { timezone: data.timezone, start: data.start, end: data.end, openWeekdays: data.openWeekdays }
      : undefined,
  });

  const save = useMutation(
    trpc.settings.updateBotSchedule.mutationOptions({
      onSuccess: () => {
        toast.success("Horário de atendimento atualizado!");
        void queryClient.invalidateQueries({ queryKey: [["settings"]] });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (isLoading) return <LoadingState />;

  const timezone = form.watch("timezone");
  const openWeekdays = form.watch("openWeekdays") ?? [];

  const toggleDay = (day: number) => {
    const next = openWeekdays.includes(day)
      ? openWeekdays.filter((d) => d !== day)
      : [...openWeekdays, day].sort((a, b) => a - b);
    form.setValue("openWeekdays", next, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <form onSubmit={form.handleSubmit((d) => save.mutate(d))} className="space-y-6">
      <FormSection
        title="Horário de atendimento"
        description="O Talison usa isto para saber a hora local da loja e se está aberta ou fechada agora."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="bot-timezone">Fuso horário</Label>
            <Select value={timezone} onValueChange={(v) => form.setValue("timezone", v, { shouldValidate: true })}>
              <SelectTrigger id="bot-timezone" className="w-full">
                <SelectValue placeholder="Selecione o fuso" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.timezone && (
              <p className="text-sm text-destructive">{form.formState.errors.timezone.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bot-open">Abre às</Label>
              <Input
                id="bot-open"
                type="time"
                {...form.register("start", { setValueAs: normalizeHhmm })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot-close">Fecha às</Label>
              <Input
                id="bot-close"
                type="time"
                {...form.register("end", { setValueAs: normalizeHhmm })}
              />
            </div>
          </div>
        </div>
        {(form.formState.errors.start || form.formState.errors.end) && (
          <p className="text-sm text-destructive">
            {form.formState.errors.start?.message ?? form.formState.errors.end?.message}
          </p>
        )}

        <div className="space-y-2">
          <Label>Dias de atendimento</Label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((day) => {
              const active = openWeekdays.includes(day.value);
              return (
                <Button
                  key={day.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  aria-pressed={active}
                  aria-label={day.long}
                  onClick={() => toggleDay(day.value)}
                  className={cn("min-w-12", !active && "text-muted-foreground")}
                >
                  {day.short}
                </Button>
              );
            })}
          </div>
          {form.formState.errors.openWeekdays && (
            <p className="text-sm text-destructive">{form.formState.errors.openWeekdays.message}</p>
          )}
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Deixe abertura e fechamento em branco para usar o horário padrão. Fora do
            horário, o Talison avisa que um atendente humano retorna no próximo período.
          </span>
        </p>
      </FormSection>

      <FormActions submitLabel="Salvar horário" isLoading={save.isPending} />
    </form>
  );
}
