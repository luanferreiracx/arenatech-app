"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ExternalLink, Settings, MessageCircle } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SUPPORTED_MODELS } from "@/lib/services/iphone-listing-parser";

const ALL_MODELS = "__all__";

function formatPriceBRL(cents: number | null): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function relativeTime(date: Date): string {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return `há ${diffSec}s`;
  if (diffSec < 3600) return `há ${Math.floor(diffSec / 60)}min`;
  if (diffSec < 86400) return `há ${Math.floor(diffSec / 3600)}h`;
  return `há ${Math.floor(diffSec / 86400)}d`;
}

function conditionLabel(condition: "LACRADO" | "SEMINOVO_CAIXA" | "SEMINOVO") {
  switch (condition) {
    case "LACRADO":
      return <Badge variant="default">Lacrado</Badge>;
    case "SEMINOVO_CAIXA":
      return <Badge variant="secondary">Seminovo c/ caixa</Badge>;
    case "SEMINOVO":
      return <Badge variant="outline">Seminovo</Badge>;
  }
}

export function IPhoneHunterSearch() {
  const trpc = useTRPC();

  const [model, setModel] = useState<string>(ALL_MODELS);
  const [hoursBack, setHoursBack] = useState<number>(48);
  const [requiresPrice, setRequiresPrice] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<{
    model: string | undefined;
    hoursBack: number;
    requiresPrice: boolean;
  }>({
    model: undefined,
    hoursBack: 48,
    requiresPrice: false,
  });

  const statsQuery = useQuery(trpc.iphoneHunter.stats.queryOptions());
  const searchQuery = useQuery(
    trpc.iphoneHunter.search.queryOptions({
      model: appliedFilters.model,
      hoursBack: appliedFilters.hoursBack,
      requiresPrice: appliedFilters.requiresPrice,
    }),
  );

  function handleSearch() {
    setAppliedFilters({
      model: model === ALL_MODELS ? undefined : model,
      hoursBack,
      requiresPrice,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href="/iphone-hunter/groups">
            <Settings className="mr-2 h-4 w-4" />
            Gerenciar grupos
          </Link>
        </Button>
      </div>

      {statsQuery.data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Anúncios (48h)</p>
            <p className="text-2xl font-semibold">{statsQuery.data.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Com preço identificado</p>
            <p className="text-2xl font-semibold">{statsQuery.data.withPrice}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Grupos monitorados</p>
            <p className="text-2xl font-semibold">{statsQuery.data.monitoredGroups}</p>
          </Card>
        </div>
      )}

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label htmlFor="model">Modelo</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model">
                <SelectValue placeholder="Todos os modelos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_MODELS}>Todos os modelos</SelectItem>
                {SUPPORTED_MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="hours">Janela</Label>
            <Select
              value={String(hoursBack)}
              onValueChange={(v) => setHoursBack(Number(v))}
            >
              <SelectTrigger id="hours">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24">24 horas</SelectItem>
                <SelectItem value="48">48 horas</SelectItem>
                <SelectItem value="72">72 horas</SelectItem>
                <SelectItem value="168">7 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="price"
                checked={requiresPrice}
                onCheckedChange={(c) => setRequiresPrice(c === true)}
              />
              <Label htmlFor="price" className="cursor-pointer text-sm font-normal">
                Apenas com preço
              </Label>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={handleSearch}>
            <Search className="mr-2 h-4 w-4" />
            Buscar
          </Button>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Postado</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Storage</TableHead>
              <TableHead>Condição</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {searchQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {searchQuery.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Nenhum anúncio encontrado para os filtros.
                </TableCell>
              </TableRow>
            )}
            {searchQuery.data?.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {relativeTime(new Date(item.postedAt))}
                </TableCell>
                <TableCell className="text-sm">{item.groupName}</TableCell>
                <TableCell className="text-sm">
                  <div className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3 text-muted-foreground" />
                    {item.senderName ?? item.senderJid.split("@")[0]}
                  </div>
                </TableCell>
                <TableCell className="font-medium">{item.model}</TableCell>
                <TableCell>
                  {item.storageGb
                    ? item.storageGb >= 1024
                      ? `${item.storageGb / 1024} TB`
                      : `${item.storageGb} GB`
                    : "—"}
                </TableCell>
                <TableCell>{conditionLabel(item.condition)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatPriceBRL(item.priceCents)}
                </TableCell>
                <TableCell className="max-w-md text-sm text-muted-foreground">
                  <span className="line-clamp-2">{item.rawSnippet}</span>
                </TableCell>
                <TableCell>
                  {item.whatsappLink && (
                    <Button asChild variant="ghost" size="icon" aria-label="Abrir conversa no WhatsApp">
                      <a href={item.whatsappLink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
