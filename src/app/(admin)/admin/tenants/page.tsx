import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { TenantsTable } from "./_components/tenants-table";

export const metadata = {
  title: "Tenants | Arena Tech Admin",
};

export default function TenantsPage() {
  return (
    <div>
      <PageHeader
        title="Tenants"
        subtitle="Gerencie as lojas cadastradas na plataforma"
        actions={
          <Button asChild>
            <Link href="/admin/tenants/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo Tenant
            </Link>
          </Button>
        }
      />
      <TenantsTable />
    </div>
  );
}
