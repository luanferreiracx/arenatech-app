"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/domain/page-header";
import { Skeleton } from "@/components/ui/skeleton";

type IntegrationProvider =
  | "AUTENTIQUE"
  | "DEPIX"
  | "INFINITEPAY"
  | "EVOLUTION_WHATSAPP"
  | "CHATWOOT"
  | "NUVEM_FISCAL"
  | "FOCUS_NFE"
  | "IMEI_CHECK";

interface IntegrationMeta {
  label: string;
  description: string;
  category: string;
}

const INTEGRATION_META: Record<IntegrationProvider, IntegrationMeta> = {
  AUTENTIQUE: {
    label: "Autentique",
    description: "Assinatura digital de contratos e documentos",
    category: "Documentos",
  },
  DEPIX: {
    label: "DePix",
    description: "Pagamentos via PIX com QR Code automatico",
    category: "Pagamentos",
  },
  INFINITEPAY: {
    label: "InfinitePay",
    description: "Checkout PIX/cartao via link — confirmacao automatica no PDV",
    category: "Pagamentos",
  },
  EVOLUTION_WHATSAPP: {
    label: "Evolution (WhatsApp)",
    description: "Notificacoes e atendimento via WhatsApp",
    category: "Comunicacao",
  },
  CHATWOOT: {
    label: "Chatwoot",
    description: "Central de atendimento omnichannel",
    category: "Comunicacao",
  },
  NUVEM_FISCAL: {
    label: "Nuvem Fiscal",
    description: "Emissao de NF-e e NFC-e",
    category: "Fiscal",
  },
  FOCUS_NFE: {
    label: "Focus NF-e",
    description: "Emissao de notas fiscais (alternativa)",
    category: "Fiscal",
  },
  IMEI_CHECK: {
    label: "IMEI Check",
    description: "Verificacao de IMEI de aparelhos",
    category: "Operacional",
  },
};

const ALL_PROVIDERS: IntegrationProvider[] = [
  "NUVEM_FISCAL",
  "FOCUS_NFE",
  "DEPIX",
  "INFINITEPAY",
  "EVOLUTION_WHATSAPP",
  "CHATWOOT",
  "AUTENTIQUE",
  "IMEI_CHECK",
];

type IntegrationRecord = {
  provider: string;
  enabled: boolean;
  config: unknown;
};

export default function IntegrationsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

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

  const getRecord = (provider: IntegrationProvider): IntegrationRecord | undefined =>
    (integrations as IntegrationRecord[] | undefined)?.find((i) => i.provider === provider);

  const getEnabled = (provider: IntegrationProvider): boolean =>
    getRecord(provider)?.enabled ?? false;

  const getConfigString = (provider: IntegrationProvider, key: string): string => {
    const config = getRecord(provider)?.config;
    if (config && typeof config === "object" && key in config) {
      const v = (config as Record<string, unknown>)[key];
      return typeof v === "string" ? v : "";
    }
    return "";
  };
  const getHandle = (provider: IntegrationProvider): string => getConfigString(provider, "handle");

  const handleToggle = (provider: IntegrationProvider, enabled: boolean) => {
    // Preserva o config existente ao ligar/desligar (ex.: nao perde o handle).
    mutation.mutate({ provider, enabled, config: getRecord(provider)?.config as Record<string, unknown> | undefined ?? undefined });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Integracoes" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  // Group by category
  const categories = new Map<string, IntegrationProvider[]>();
  for (const provider of ALL_PROVIDERS) {
    const meta = INTEGRATION_META[provider];
    const list = categories.get(meta.category) ?? [];
    list.push(provider);
    categories.set(meta.category, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integracoes"
        subtitle="Ative e configure integracoes com servicos externos"
      />

      {Array.from(categories.entries()).map(([category, providers]) => (
        <div key={category} className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {category}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {providers.map((provider) => {
              const meta = INTEGRATION_META[provider];
              const enabled = getEnabled(provider);

              return (
                <Card key={provider}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        {meta.label}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant={enabled ? "default" : "secondary"}>
                          {enabled ? "Ativo" : "Inativo"}
                        </Badge>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) => handleToggle(provider, checked)}
                          disabled={mutation.isPending}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {meta.description}
                    </p>
                    {provider === "INFINITEPAY" && (
                      <InfinitepayConfig
                        // Remonta (reseta os inputs) quando o config salvo muda.
                        key={`${getHandle("INFINITEPAY")}|${getConfigString("INFINITEPAY", "defaultEmail")}`}
                        enabled={enabled}
                        initialHandle={getHandle("INFINITEPAY")}
                        initialEmail={getConfigString("INFINITEPAY", "defaultEmail")}
                        saving={mutation.isPending}
                        onSave={(handle, defaultEmail) =>
                          mutation.mutate({
                            provider: "INFINITEPAY",
                            enabled: true,
                            config: { handle, defaultEmail },
                          })
                        }
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
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
