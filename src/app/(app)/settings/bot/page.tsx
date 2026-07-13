"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Undo2, ShieldCheck } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { LoadingState } from "@/components/domain/loading-state";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  updateBotConfigSchema,
  type UpdateBotConfigInput,
  BOT_INSTRUCTIONS_MAX_CHARS,
} from "@/lib/validators/bot-config";
import { renderStoreInstructionsBlock } from "@/lib/talison/prompt";
import { BotScheduleForm } from "./_components/bot-schedule-form";

export default function BotSettingsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // RBAC: instruções do bot são admin (espelha updateBotConfig no servidor).
  const isAdmin = useIsTenantAdmin();

  const { data, isLoading } = useQuery(trpc.settings.getBotConfig.queryOptions());

  // Um só schema para cliente e servidor (paridade de validação anti-injeção).
  const form = useForm<UpdateBotConfigInput>({
    resolver: zodResolver(updateBotConfigSchema),
    values: data
      ? { enabled: data.enabled, instructions: data.instructions ?? "" }
      : undefined,
  });

  const enabled = form.watch("enabled");
  const instructions = form.watch("instructions") ?? "";
  const charCount = instructions.length;
  const overCap = charCount > BOT_INSTRUCTIONS_MAX_CHARS;
  const trimmed = instructions.trim();

  const save = useMutation(
    trpc.settings.updateBotConfig.mutationOptions({
      onSuccess: () => {
        toast.success("Instruções do assistente atualizadas!");
        void queryClient.invalidateQueries({ queryKey: [["settings"]] });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const undo = useMutation(
    trpc.settings.undoBotConfig.mutationOptions({
      onSuccess: () => {
        toast.success("Alteração anterior restaurada.");
        void queryClient.invalidateQueries({ queryKey: [["settings"]] });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Assistente (Talison)"
          subtitle="Instruções da loja para o atendimento automático"
        />
        <p className="py-8 text-center text-muted-foreground">
          Apenas administradores do tenant podem alterar estas configurações.
        </p>
      </div>
    );
  }

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Assistente (Talison)"
        subtitle="O que o atendimento automático deve saber sobre a sua loja"
      />

      <form onSubmit={form.handleSubmit((d) => save.mutate(d))} className="space-y-6">
        <FormSection
          title="Instruções da loja"
          description="Conhecimento e políticas que o Talison usa ao responder seus clientes no WhatsApp."
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="bot-enabled">Usar instruções da loja</Label>
              <p className="text-sm text-muted-foreground">
                Quando ligado, o texto abaixo é incluído no atendimento. Desligado, o
                Talison responde só com as regras padrão.
              </p>
            </div>
            <Switch
              id="bot-enabled"
              checked={enabled}
              onCheckedChange={(v) => form.setValue("enabled", v, { shouldValidate: true })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="bot-instructions">Texto das instruções</Label>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  overCap ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {charCount} / {BOT_INSTRUCTIONS_MAX_CHARS}
              </span>
            </div>
            <Textarea
              id="bot-instructions"
              {...form.register("instructions")}
              rows={10}
              disabled={!enabled}
              placeholder={
                "Ex.: Somos especializados em iPhone e acessórios Apple. " +
                "Entregamos em Teresina no mesmo dia. Horário de funcionamento 9h-18h. " +
                "Aceitamos PIX (5% de desconto) e cartão em até 12x."
              }
            />
            {form.formState.errors.instructions && (
              <p className="text-sm text-destructive">
                {form.formState.errors.instructions.message}
              </p>
            )}
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Escreva como conhecimento da loja, não como comandos ao sistema. As
                regras de segurança e identidade do Talison sempre prevalecem, e o texto
                entra em toda conversa — seja objetivo para não encarecer o atendimento.
              </span>
            </p>
          </div>
        </FormSection>

        {enabled && trimmed.length > 0 && (
          <FormSection
            title="Prévia"
            description="Exatamente o trecho que será acrescentado ao atendimento."
          >
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
              {renderStoreInstructionsBlock(trimmed)}
            </pre>
          </FormSection>
        )}

        <div className="flex items-center justify-between gap-3 pt-4">
          {data?.canUndo ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => undo.mutate()}
              disabled={undo.isPending || save.isPending}
            >
              <Undo2 className="mr-2 h-4 w-4" />
              Desfazer última alteração
            </Button>
          ) : (
            <span />
          )}
          <FormActions submitLabel="Salvar" isLoading={save.isPending} className="border-0 pt-0" />
        </div>
      </form>

      <div className="mt-10 border-t border-border pt-8">
        <BotScheduleForm />
      </div>
    </div>
  );
}
