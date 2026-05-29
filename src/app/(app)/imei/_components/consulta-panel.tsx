"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Smartphone, FileText } from "lucide-react";
import { ImeiConsult } from "./imei-consult";
import { NfeConsult } from "./nfe-consult";

export function ConsultaPanel() {
  return (
    <Tabs defaultValue="imei" className="space-y-6">
      <TabsList>
        <TabsTrigger value="imei">
          <Smartphone className="mr-2 h-4 w-4" />
          IMEI / Serial
        </TabsTrigger>
        <TabsTrigger value="nfe">
          <FileText className="mr-2 h-4 w-4" />
          NF-e (DANFE)
        </TabsTrigger>
      </TabsList>

      <TabsContent value="imei">
        <ImeiConsult />
      </TabsContent>
      <TabsContent value="nfe">
        <NfeConsult />
      </TabsContent>
    </Tabs>
  );
}
