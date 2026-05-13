import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { ProviderDetail } from "./_components/provider-detail";

export const metadata = {
  title: "Detalhe do Prestador | Arena Tech",
};

export default async function ProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <PageHeader
        title="Detalhe do Prestador"
        subtitle="Apuracao e comissoes do prestador"
        actions={
          <Button variant="outline" asChild>
            <Link href="/commissions/providers">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />
      <ProviderDetail providerId={id} />
    </div>
  );
}
