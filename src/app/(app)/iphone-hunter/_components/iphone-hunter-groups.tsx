"use client";

import { RefreshCw } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function IPhoneHunterGroups() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const evolutionQuery = useQuery(trpc.iphoneHunter.listEvolutionGroups.queryOptions());

  const upsertMutation = useMutation(
    trpc.iphoneHunter.upsertGroup.mutationOptions({
      onSuccess: () => {
        toast.success("Grupo atualizado");
        queryClient.invalidateQueries({
          queryKey: trpc.iphoneHunter.listEvolutionGroups.queryKey(),
        });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function handleToggle(group: { jid: string; name: string; monitored: boolean }) {
    upsertMutation.mutate({
      evolutionGroupJid: group.jid,
      name: group.name,
      monitored: !group.monitored,
    });
  }

  function handleRefresh() {
    queryClient.invalidateQueries({
      queryKey: trpc.iphoneHunter.listEvolutionGroups.queryKey(),
    });
  }

  if (evolutionQuery.isLoading) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground">Carregando grupos da Evolution API…</p>
      </Card>
    );
  }

  if (!evolutionQuery.data || evolutionQuery.data.length === 0) {
    return (
      <Card className="p-6 space-y-3">
        <p className="text-muted-foreground">
          Nenhum grupo retornado pela Evolution API. Verifique se a instância está
          conectada e se as variáveis EVOLUTION_API_URL / EVOLUTION_API_KEY estão configuradas.
        </p>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Recarregar
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {evolutionQuery.data.length} grupos disponíveis na instância
        </p>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Recarregar
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grupo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Monitorar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evolutionQuery.data.map((group) => (
              <TableRow key={group.jid}>
                <TableCell>
                  <div className="font-medium">{group.name}</div>
                  <div className="text-xs text-muted-foreground">{group.jid}</div>
                </TableCell>
                <TableCell>
                  {group.monitored ? (
                    <Badge variant="default">Ativo</Badge>
                  ) : group.persistedId ? (
                    <Badge variant="outline">Pausado</Badge>
                  ) : (
                    <Badge variant="secondary">Não cadastrado</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Switch
                    checked={group.monitored}
                    onCheckedChange={() => handleToggle(group)}
                    disabled={upsertMutation.isPending}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
