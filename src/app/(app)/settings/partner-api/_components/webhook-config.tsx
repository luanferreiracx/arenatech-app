"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Loader2, RefreshCw, Webhook } from "lucide-react";

/** Config do webhook de saída (1 por tenant): URL + secret HMAC. */
export function WebhookConfig() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const cfgQuery = useQuery(trpc.partnerApiKey.getWebhook.queryOptions());

  const [url, setUrl] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  // Valor controlado: começa do servidor, depois reflete edição local.
  const value = url ?? cfgQuery.data?.url ?? "";

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: [["partnerApiKey", "getWebhook"]] });
  }

  const saveUrl = useMutation(
    trpc.partnerApiKey.setWebhookUrl.mutationOptions({
      onSuccess: (res) => {
        toast.success("Webhook salvo");
        if (res.secret) setNewSecret(res.secret); // 1ª vez: mostra o secret
        invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const rotate = useMutation(
    trpc.partnerApiKey.rotateWebhookSecret.mutationOptions({
      onSuccess: (res) => {
        setNewSecret(res.secret);
        toast.success("Secret rotacionado");
        invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  async function copy(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      toast.success("Copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <Card className="p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Webhook className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Webhook (notificações)</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Notificamos esta URL (POST) quando um depósito confirma ou um saque conclui. A
        requisição vem assinada em <code className="font-mono">X-Signature: sha256=…</code>{" "}
        (HMAC do corpo com o seu secret). Entrega best-effort — use o{" "}
        <code className="font-mono">GET /transactions/:id</code> como fallback.
      </p>

      <div>
        <Label htmlFor="whUrl">URL (HTTPS)</Label>
        <div className="flex gap-2 mt-1">
          <Input
            id="whUrl"
            value={value}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://seu-sistema.com/webhooks/depix"
            className="font-mono text-sm"
          />
          <Button
            onClick={() => saveUrl.mutate({ url: value.trim() || null })}
            disabled={saveUrl.isPending}
          >
            {saveUrl.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {cfgQuery.data?.hasSecret ? "Secret configurado." : "Sem secret ainda (gerado ao salvar a URL)."}
          {cfgQuery.data?.lastDeliveryAt &&
            ` Última entrega: ${new Date(cfgQuery.data.lastDeliveryAt).toLocaleString("pt-BR")}.`}
        </span>
        {cfgQuery.data?.hasSecret && (
          <Button variant="outline" size="sm" onClick={() => rotate.mutate()} disabled={rotate.isPending}>
            <RefreshCw className={rotate.isPending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            <span className="ml-1.5">Rotacionar secret</span>
          </Button>
        )}
      </div>

      {newSecret && (
        <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
          <p className="text-xs font-medium">Secret (copie agora — exibido uma única vez):</p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono break-all flex-1">{newSecret}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(newSecret)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
