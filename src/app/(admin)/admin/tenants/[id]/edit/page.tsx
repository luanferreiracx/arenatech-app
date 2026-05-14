import { PageHeader } from "@/components/domain/page-header";
import { TenantDetail } from "../../_components/tenant-detail";

export const metadata = {
  title: "Editar Tenant | Arena Tech Admin",
};

export default async function TenantEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title="Editar Tenant" subtitle="Alterar dados e configuracoes do tenant" />
      <TenantDetail tenantId={id} />
    </div>
  );
}
