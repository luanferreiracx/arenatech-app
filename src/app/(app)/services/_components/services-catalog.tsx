"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Settings, Copy, MessageCircle, Check } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { WhatsAppDialog } from "./whatsapp-dialog";

function formatCurrency(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function buildQuoteText(service: {
  serviceType: string | null;
  deviceModel: string | null;
  basePrice: number;
}): string {
  const price = formatCurrency(service.basePrice);
  const installmentValue = formatCurrency(Math.round(service.basePrice / 12));
  const pixPrice = formatCurrency(Math.round((service.basePrice * 95) / 100));

  return [
    "\u{1F527} ORCAMENTO",
    `\u{1F4F1} Servico: ${service.serviceType ?? "-"}`,
    `\u{1F4F2} Aparelho: ${service.deviceModel ?? "-"}`,
    `\u{1F4B0} Valor: ${price}`,
    `\u{1F4B3} Parcelamento: ate 12x de ${installmentValue} sem juros`,
    `\u{1F4B5} Desconto PIX: 5% = ${pixPrice}`,
    `\u{2705} Valido por 48h`,
    "",
    "Arena Tech - Assistencia Tecnica",
  ].join("\n");
}

export function ServicesCatalog() {
  const trpc = useTRPC();
  const [serviceType, setServiceType] = useState<string>("");
  const [deviceModel, setDeviceModel] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [whatsAppService, setWhatsAppService] = useState<{
    id: string;
    serviceType: string | null;
    deviceModel: string | null;
    basePrice: number;
  } | null>(null);

  const { data: serviceTypes } = useQuery(
    trpc.catalog.listServiceTypes.queryOptions(),
  );

  const { data: deviceModels } = useQuery(
    trpc.catalog.listDeviceModels.queryOptions(
      serviceType ? { serviceType } : undefined,
    ),
  );

  const { data: grouped, isLoading } = useQuery(
    trpc.catalog.listServicesGrouped.queryOptions({
      serviceType: serviceType || undefined,
      deviceModel: deviceModel || undefined,
    }),
  );

  const handleCopy = useCallback(
    async (
      id: string,
      service: {
        serviceType: string | null;
        deviceModel: string | null;
        basePrice: number;
      },
    ) => {
      try {
        const text = buildQuoteText(service);
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        toast.success("Orcamento copiado!");
        setTimeout(() => setCopiedId(null), 2000);
      } catch {
        toast.error("Erro ao copiar orcamento");
      }
    },
    [],
  );

  const groupEntries = grouped ? Object.entries(grouped) : [];

  return (
    <div className="space-y-6">
      {/* Filters + Admin button */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={serviceType} onValueChange={(v) => { setServiceType(v === "__all__" ? "" : v); setDeviceModel(""); }}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Tipo de Servico" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os tipos</SelectItem>
            {serviceTypes?.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={deviceModel} onValueChange={(v) => setDeviceModel(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Modelo do Aparelho" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os modelos</SelectItem>
            {deviceModels?.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Button variant="outline" asChild>
            <Link href="/services/manage">
              <Settings className="mr-2 h-4 w-4" />
              Gerenciar Servicos
            </Link>
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-40" />
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && groupEntries.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Nenhum servico encontrado.
        </div>
      )}

      {/* Grouped cards */}
      {groupEntries.map(([type, services]) => (
        <div key={type}>
          <h2 className="text-lg font-semibold mb-3 border-b pb-2">{type}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {services.map((s) => (
              <Card key={s.id} className="flex flex-col">
                <CardContent className="flex flex-col flex-1 gap-3 pt-5">
                  <div className="font-medium text-sm">
                    {s.deviceModel ?? s.name}
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(s.basePrice)}
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {s.description}
                    </p>
                  )}
                  <div className="mt-auto flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleCopy(s.id, s)}
                    >
                      {copiedId === s.id ? (
                        <Check className="mr-1 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1 h-3.5 w-3.5" />
                      )}
                      {copiedId === s.id ? "Copiado!" : "Copiar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1 bg-[#25D366] hover:bg-[#128C7E] text-white"
                      onClick={() =>
                        setWhatsAppService({
                          id: s.id,
                          serviceType: s.serviceType,
                          deviceModel: s.deviceModel,
                          basePrice: s.basePrice,
                        })
                      }
                    >
                      <MessageCircle className="mr-1 h-3.5 w-3.5" />
                      WhatsApp
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* WhatsApp dialog */}
      <WhatsAppDialog
        service={whatsAppService}
        onClose={() => setWhatsAppService(null)}
      />
    </div>
  );
}
