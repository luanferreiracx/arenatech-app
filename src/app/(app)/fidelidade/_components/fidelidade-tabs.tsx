"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTRPC } from "@/trpc/react";
import { RewardCampaignsManager } from "./reward-campaigns-manager";
import { RewardActionsQueue } from "./reward-actions-queue";

/**
 * Abas da fidelidade: Submissões (fila de aprovação — o trabalho do dia a dia)
 * primeiro, Campanhas (configuração) depois.
 *
 * FDU-2: com o programa ainda não configurado, a ordem se inverte. Abrir em
 * Submissões dizendo "quando um cliente publicar, aparece aqui" é conselho
 * impossível quando não há campanha: sem campanha nenhum cliente publica, e a
 * loja cai numa tela que manda esperar em vez de mostrar o próximo passo. Em
 * produção o módulo tem ZERO campanhas — esta é a tela que a loja vê hoje.
 */
export function FidelidadeTabs() {
  const trpc = useTRPC();
  const campanhas = useQuery(trpc.reward.listCampaigns.queryOptions({}));
  const semCampanha = campanhas.isSuccess && campanhas.data.total === 0;

  const [tabEscolhida, setTab] = useState<string | null>(null);
  const tab = tabEscolhida ?? (semCampanha ? "campanhas" : "submissoes");

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="submissoes">Submissões</TabsTrigger>
        <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
      </TabsList>
      <TabsContent value="submissoes">
        <RewardActionsQueue />
      </TabsContent>
      <TabsContent value="campanhas">
        <RewardCampaignsManager />
      </TabsContent>
    </Tabs>
  );
}
