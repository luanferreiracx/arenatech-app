"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RewardCampaignsManager } from "./reward-campaigns-manager";
import { RewardActionsQueue } from "./reward-actions-queue";

/**
 * Abas da fidelidade: Submissões (fila de aprovação — o trabalho do dia a dia)
 * primeiro, Campanhas (configuração) depois.
 */
export function FidelidadeTabs() {
  const [tab, setTab] = useState("submissoes");

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
