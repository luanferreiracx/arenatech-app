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
 *
 * FDU-3 (Etapa 9, M9): o FDU-2 resolveu o problema certo com um estado que se
 * MOVIA. `tab` era derivado de `semCampanha` enquanto ninguém tivesse clicado
 * numa aba — então, no instante em que a loja criava a PRIMEIRA campanha,
 * `semCampanha` virava `false` e a aba saltava sozinha de Campanhas para
 * Submissões.
 *
 * Medido no navegador: criar a 1ª campanha devolvia o operador a uma lista
 * vazia dizendo "quando um cliente publicar, a submissão aparece aqui" — a
 * campanha recém-criada em lugar nenhum, e a impressão de que o salvamento
 * falhou. Criar a 2ª campanha NÃO saltava (aí `tabEscolhida` já existia), o que
 * isola o defeito no primeiro contato da loja com o módulo: exatamente quem
 * menos tem repertório para entender o que aconteceu.
 *
 * O padrão da aba é uma decisão de ABERTURA, não uma função do estado atual:
 * congela na primeira resposta e não se mexe mais.
 */
export function FidelidadeTabs() {
  const trpc = useTRPC();
  const campanhas = useQuery(trpc.reward.listCampaigns.queryOptions({}));

  const [tabEscolhida, setTab] = useState<string | null>(null);
  const [padraoInicial, setPadraoInicial] = useState<string | null>(null);

  // Congela na PRIMEIRA resposta e nunca mais recalcula. Em estado, não em ref:
  // escrever/ler ref durante o render quebra com o React Compiler
  // (`react-hooks/refs`) — o lint pegou a primeira tentativa.
  if (padraoInicial === null && campanhas.isSuccess) {
    setPadraoInicial(campanhas.data.total === 0 ? "campanhas" : "submissoes");
  }

  // Antes da 1ª resposta ainda não dá para saber; "submissoes" é o valor do
  // `TabsList` e evita piscar a aba errada durante o carregamento.
  const tab = tabEscolhida ?? padraoInicial ?? "submissoes";

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
