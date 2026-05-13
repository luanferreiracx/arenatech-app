"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeliveryPersonsTab } from "./delivery-persons-tab";
import { ExternalLabsTab } from "./external-labs-tab";
import { LabOrdersTab } from "./lab-orders-tab";
import { ServiceProvidersTab } from "./service-providers-tab";

export function OperationDashboard() {
  const [activeTab, setActiveTab] = useState("delivery");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="mb-4">
        <TabsTrigger value="delivery">Entregadores</TabsTrigger>
        <TabsTrigger value="labs">Laboratorios</TabsTrigger>
        <TabsTrigger value="orders">Envios Lab</TabsTrigger>
        <TabsTrigger value="providers">Prestadores</TabsTrigger>
      </TabsList>

      <TabsContent value="delivery"><DeliveryPersonsTab /></TabsContent>
      <TabsContent value="labs"><ExternalLabsTab /></TabsContent>
      <TabsContent value="orders"><LabOrdersTab /></TabsContent>
      <TabsContent value="providers"><ServiceProvidersTab /></TabsContent>
    </Tabs>
  );
}
