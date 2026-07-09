"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/domain/page-header";
import { Skeleton } from "@/components/ui/skeleton";

type IntegrationRecord = {
  provider: string;
  enabled: boolean;
  config: unknown;
};

export default function IntegrationsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // RBAC: editar credenciais de integração é admin (espelha o gate de
  // settings.updateIntegration no servidor). Operador não vê o form.
  const isAdmin = useIsTenantAdmin();

  const { data: integrations, isLoading } = useQuery(
    trpc.settings.listIntegrations.queryOptions()
  );

  const mutation = useMutation(
    trpc.settings.updateIntegration.mutationOptions({
      onSuccess: () => {
        toast.success("Integracao atualizada!");
        queryClient.invalidateQueries({ queryKey: [["settings"]] });
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const record = (integrations as IntegrationRecord[] | undefined)?.find(
    (i) => i.provider === "INFINITEPAY"
  );
  const enabled = record?.enabled ?? false;

  const getConfigString = (key: string): string => {
    const config = record?.config;
    if (config && typeof config === "object" && key in config) {
      const v = (config as Record<string, unknown>)[key];
      return typeof v === "string" ? v : "";
    }
    return "";
  };
  const handle = getConfigString("handle");
  const defaultEmail = getConfigString("defaultEmail");

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Integracoes" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Apenas administradores do tenant podem alterar as integracoes.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Integracoes" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integracoes"
        subtitle="Serviços externos que você conecta à sua loja"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">InfinitePay</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={enabled ? "default" : "secondary"}>
                  {enabled ? "Ativo" : "Inativo"}
                </Badge>
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) =>
                    // Preserva o config existente ao ligar/desligar (não perde o handle).
                    mutation.mutate({
                      provider: "INFINITEPAY",
                      enabled: checked,
                      config: (record?.config as Record<string, unknown> | undefined) ?? undefined,
                    })
                  }
                  disabled={mutation.isPending}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Checkout PIX/cartão via link — confirmação automática no PDV.
            </p>
            <InfinitepayConfig
              // Remonta (reseta os inputs) quando o config salvo muda.
              key={`${handle}|${defaultEmail}`}
              enabled={enabled}
              initialHandle={handle}
              initialEmail={defaultEmail}
              saving={mutation.isPending}
              onSave={(h, email) =>
                mutation.mutate({
                  provider: "INFINITEPAY",
                  enabled: true,
                  config: { handle: h, defaultEmail: email },
                })
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfinitepayConfig({
  enabled,
  initialHandle,
  initialEmail,
  saving,
  onSave,
}: {
  enabled: boolean;
  initialHandle: string;
  initialEmail: string;
  saving: boolean;
  onSave: (handle: string, defaultEmail: string) => void;
}) {
  const [handle, setHandle] = useState(initialHandle);
  const [email, setEmail] = useState(initialEmail);

  const dirty = handle.trim() !== initialHandle.trim() || email.trim() !== initialEmail.trim();

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <div className="space-y-1">
        <Label htmlFor="infinitepay-handle" className="text-xs">
          InfiniteTag (handle)
        </Label>
        <Input
          id="infinitepay-handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="sua-tag (sem o $)"
          disabled={!enabled}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="infinitepay-email" className="text-xs">
          Email padrao do checkout
        </Label>
        <Input
          id="infinitepay-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vendas@sualoja.com.br"
          disabled={!enabled}
        />
        <p className="text-[11px] text-muted-foreground">
          Usado para pre-preencher o checkout em vendas de balcao (sem cliente).
          O email do cliente cadastrado tem prioridade quando houver.
        </p>
      </div>
      <Button
        size="sm"
        disabled={!enabled || saving || !dirty}
        onClick={() => onSave(handle.trim(), email.trim())}
      >
        Salvar
      </Button>
      <p className="text-[11px] text-muted-foreground">
        InfiniteTag = seu usuario no app InfinitePay, sem o <code>$</code>. O
        checkout aceita PIX e cartao; no PDV aparece como forma &quot;InfinitePay&quot;.
      </p>
    </div>
  );
}
