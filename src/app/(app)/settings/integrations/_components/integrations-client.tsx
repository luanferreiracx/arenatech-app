"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Settings } from "lucide-react";

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
  fields: Array<{ key: string; label: string; type?: string }>;
}

const INTEGRATIONS: Record<IntegrationProvider, IntegrationMeta> = {
  AUTENTIQUE: {
    label: "Autentique",
    description: "Assinatura digital de documentos",
    fields: [{ key: "apiToken", label: "API Token" }],
  },
  DEPIX: {
    label: "Depix (PixPay)",
    description: "Pagamentos via PIX",
    fields: [
      { key: "apiKey", label: "API Key" },
      { key: "secret", label: "Secret", type: "password" },
    ],
  },
  EVOLUTION_WHATSAPP: {
    label: "Evolution WhatsApp",
    description: "Envio de mensagens via WhatsApp",
    fields: [
      { key: "apiUrl", label: "URL da API" },
      { key: "apiKey", label: "API Key" },
      { key: "instance", label: "Nome da Instância" },
    ],
  },
  CHATWOOT: {
    label: "Chatwoot",
    description: "Atendimento ao cliente via chat",
    fields: [
      { key: "apiUrl", label: "URL da API" },
      { key: "apiToken", label: "API Token" },
      { key: "inboxId", label: "ID do Inbox" },
    ],
  },
  NUVEM_FISCAL: {
    label: "Nuvem Fiscal",
    description: "Emissão de NF-e / NFC-e",
    fields: [
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client Secret", type: "password" },
    ],
  },
  FOCUS_NFE: {
    label: "Focus NFe",
    description: "Emissão de NF-e (alternativo)",
    fields: [{ key: "token", label: "Token", type: "password" }],
  },
  IMEI_CHECK: {
    label: "IMEI Check",
    description: "Verificação de IMEI de aparelhos",
    fields: [{ key: "apiKey", label: "API Key" }],
  },
};

const ALL_PROVIDERS = Object.keys(INTEGRATIONS) as IntegrationProvider[];

export function IntegrationsClient() {
  const trpc = useTRPC();
  const [configProvider, setConfigProvider] = useState<IntegrationProvider | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});

  const { data: integrations = [], refetch } = useQuery(
    trpc.settings.listIntegrations.queryOptions(),
  );

  const updateMutation = useMutation(
    trpc.settings.updateIntegration.mutationOptions({
      onSuccess: () => {
        void refetch();
        toast.success("Integração atualizada!");
        setConfigProvider(null);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const getIntegration = (provider: IntegrationProvider) =>
    integrations.find((i) => i.provider === provider);

  const handleToggle = (provider: IntegrationProvider, enabled: boolean) => {
    const existing = getIntegration(provider);
    updateMutation.mutate({
      provider,
      enabled,
      config: (existing?.config as Record<string, string>) ?? {},
    });
  };

  const openConfig = (provider: IntegrationProvider) => {
    const existing = getIntegration(provider);
    setConfigValues((existing?.config as Record<string, string>) ?? {});
    setConfigProvider(provider);
  };

  const saveConfig = () => {
    if (!configProvider) return;
    const existing = getIntegration(configProvider);
    updateMutation.mutate({
      provider: configProvider,
      enabled: existing?.enabled ?? false,
      config: configValues,
    });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {ALL_PROVIDERS.map((provider) => {
        const meta = INTEGRATIONS[provider];
        const integration = getIntegration(provider);
        const isEnabled = integration?.enabled ?? false;

        return (
          <Card key={provider} className={isEnabled ? "border-primary/40" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{meta.label}</CardTitle>
                  <CardDescription className="mt-0.5">{meta.description}</CardDescription>
                </div>
                <Badge variant={isEnabled ? "default" : "secondary"} className="shrink-0 ml-2">
                  {isEnabled ? "Ativo" : "Inativo"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => handleToggle(provider, checked)}
                    disabled={updateMutation.isPending}
                  />
                  <span className="text-sm text-muted-foreground">
                    {isEnabled ? "Habilitado" : "Desabilitado"}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openConfig(provider)}
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Configurar
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Config Dialog */}
      {configProvider && (
        <Dialog open={true} onOpenChange={(open) => !open && setConfigProvider(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Configurar — {INTEGRATIONS[configProvider].label}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {INTEGRATIONS[configProvider].fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    type={field.type ?? "text"}
                    value={configValues[field.key] ?? ""}
                    onChange={(e) =>
                      setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    placeholder={field.type === "password" ? "••••••••" : ""}
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigProvider(null)}>
                Cancelar
              </Button>
              <Button onClick={saveConfig} disabled={updateMutation.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
