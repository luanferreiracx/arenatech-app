"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { LoadingState } from "@/components/domain/loading-state";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

// NOTE: Addons are a SaaS-level feature. The schema for addons does not yet exist
// in Prisma. This page is a placeholder that will be connected once the
// addon schema is created. For now it shows the UI structure from the Laravel version.

export default function AddonsPage() {
  return (
    <div>
      <PageHeader
        title="Gestao de Addons"
        subtitle="Pacotes de consultas IMEI extras para tenants"
        actions={
          <Button disabled>
            <Plus className="w-4 h-4 mr-2" />
            Novo Addon
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-primary">0</div>
            <div className="text-sm text-muted-foreground">Total Vendidos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-green-500">0</div>
            <div className="text-sm text-muted-foreground">Ativos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-blue-500">R$ 0,00</div>
            <div className="text-sm text-muted-foreground">Receita Total</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <EmptyState
            title="Nenhum addon cadastrado"
            description="O schema de addons sera implementado em uma proxima fase. Esta pagina esta preparada para receber os dados."
          />
        </CardContent>
      </Card>
    </div>
  );
}
