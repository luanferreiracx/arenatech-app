"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/lib/toast";

/**
 * Configuração global da plataforma (ADR 0061). Hoje: quantos dias de teste
 * grátis um tenant novo ganha por padrão.
 *
 * O prazo de UM tenant específico é ajustado no detalhe dele ("Estender teste") —
 * este número é só o padrão de quem nasce agora, e mudá-lo não mexe em teste
 * já em andamento.
 */
export function PlatformSettingsCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(trpc.admin.platformSettings.queryOptions());
  const updateMutation = useMutation(trpc.admin.updatePlatformSettings.mutationOptions());
  const [draft, setDraft] = useState<string | null>(null);

  // `draft ?? data` evita effect de sincronização: enquanto ninguém digitou, a
  // fonte é o servidor; a partir do primeiro toque, é o rascunho.
  const value = draft ?? (data ? String(data.trialDays) : "");

  const onSave = () => {
    const days = Number(value);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      toast.error("Informe um número de dias entre 0 e 365.");
      return;
    }
    updateMutation.mutate(
      { trialDays: days },
      {
        onSuccess: (settings) => {
          toast.success(
            settings.trialDays === 0
              ? "Teste grátis desligado para tenants novos"
              : `Teste grátis padrão: ${settings.trialDays} dias`,
          );
          setDraft(null);
          void queryClient.invalidateQueries({ queryKey: trpc.admin.platformSettings.queryKey() });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FlaskConical className="size-5 shrink-0 text-info" aria-hidden />
          <span className="min-w-0 break-words">Teste grátis</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="trial-days-default">Dias por padrão</Label>
              <Input
                id="trial-days-default"
                inputMode="numeric"
                className="sm:w-32"
                value={value}
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>
            <Button type="button" onClick={onSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar
            </Button>
            <p className="min-w-0 flex-1 break-words text-xs text-muted-foreground">
              Vale para tenants que começarem a testar a partir de agora. Testes em andamento não
              mudam — para ajustar um deles, use &ldquo;Estender teste&rdquo; no detalhe do tenant.
              Zero desliga o teste grátis.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
