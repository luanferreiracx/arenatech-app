"use client";

import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/domain/page-header";
import { Skeleton } from "@/components/ui/skeleton";

type IntegrationProvider =
  | "AUTENTIQUE"
  | "DEPIX"
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
  "EVOLUTION_WHATSAPP",
  "CHATWOOT",
  "AUTENTIQUE",
  "IMEI_CHECK",
];

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

  const getEnabled = (provider: IntegrationProvider): boolean => {
    return integrations?.find((i) => i.provider === provider)?.enabled ?? false;
  };

  const handleToggle = (provider: IntegrationProvider, enabled: boolean) => {
    mutation.mutate({ provider, enabled });
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
