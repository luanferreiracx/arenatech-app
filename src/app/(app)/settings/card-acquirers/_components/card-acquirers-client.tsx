"use client";

import { PageHeader } from "@/components/domain/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReceivingAccountsTab } from "./receiving-accounts-tab";
import { AcquirersTab } from "./acquirers-tab";
import { CardBrandsTab } from "./card-brands-tab";

export function CardAcquirersClient() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meios de Recebimento"
        subtitle="Adquirentes (maquininhas), bandeiras, taxas por parcela e contas onde o dinheiro cai"
      />

      <Tabs defaultValue="acquirers">
        <TabsList>
          <TabsTrigger value="acquirers">Adquirentes</TabsTrigger>
          <TabsTrigger value="brands">Bandeiras</TabsTrigger>
          <TabsTrigger value="accounts">Contas de Recebimento</TabsTrigger>
        </TabsList>

        <TabsContent value="acquirers" className="mt-4">
          <AcquirersTab />
        </TabsContent>
        <TabsContent value="brands" className="mt-4">
          <CardBrandsTab />
        </TabsContent>
        <TabsContent value="accounts" className="mt-4">
          <ReceivingAccountsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
