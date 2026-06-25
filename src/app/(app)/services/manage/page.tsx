import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, SlidersHorizontal, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { ServicesManageTable } from "../_components/services-table";
import { ServiceObservationsManager } from "../_components/service-observations-manager";

export const metadata = {
  title: "Gerenciar Servicos | Arena Tech",
};

export default function ManageServicesPage() {
  return (
    <div>
      <PageHeader
        title="Gerenciar Servicos"
        subtitle="Administre o catalogo de servicos, precos e tipos"
        actions={
          <Button variant="outline" asChild>
            <Link href="/services">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao Catalogo
            </Link>
          </Button>
        }
      />
      <div className="space-y-6">
        {/* Atalho: termos de servico + config de orcamento vivem em
            Configuracoes > Assistencia (no Laravel ficavam aqui na mesma tela). */}
        <Link
          href="/settings/assistance"
          className="flex items-center justify-between gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-muted/40"
        >
          <div className="flex items-start gap-3">
            <div className="flex gap-1 text-muted-foreground">
              <FileText className="h-5 w-5" />
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">Termos de servico e configuracoes de orcamento</p>
              <p className="text-sm text-muted-foreground">
                Edite os termos exibidos na OS, parcelas sem juros e desconto PIX usados nos orcamentos em Configuracoes &gt; Assistencia.
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>

        <Suspense fallback={<LoadingState variant="table" />}>
          <ServicesManageTable />
        </Suspense>
        <ServiceObservationsManager />
      </div>
    </div>
  );
}
