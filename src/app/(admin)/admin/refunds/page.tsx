"use client";

import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/page-header";
import { EmptyState } from "@/components/domain/empty-state";

// NOTE: Refunds/estornos are a SaaS billing feature. The schema for plan downgrades
// and refund tracking does not yet exist in Prisma. This page is a placeholder.

export default function RefundsPage() {
  return (
    <div>
      <PageHeader
        title="Estornos de Downgrades"
        subtitle="Gerencie os estornos pendentes de mudanca de plano"
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold">0</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-yellow-500">0</div>
            <div className="text-sm text-muted-foreground">Pendentes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-green-500">0</div>
            <div className="text-sm text-muted-foreground">Processados</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-muted-foreground">0</div>
            <div className="text-sm text-muted-foreground">Cancelados</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <EmptyState
            title="Nenhum estorno encontrado"
            description="Estornos serao gerados automaticamente quando tenants fizerem downgrade de plano. O schema de billing sera implementado em uma proxima fase."
          />
        </CardContent>
      </Card>
    </div>
  );
}
