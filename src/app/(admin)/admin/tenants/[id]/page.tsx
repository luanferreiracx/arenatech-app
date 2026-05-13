import { PageHeader } from "@/components/domain/page-header";
import { TenantDetail } from "../_components/tenant-detail";

export const metadata = {
  title: "Detalhe Tenant | Arena Tech Admin",
};

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title="Detalhe do Tenant" subtitle="Informacoes e usuarios do tenant" />
      <TenantDetail tenantId={id} />
    </div>
  );
}
