import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { DevicesTable } from "./_components/devices-table";

export const metadata = {
  title: "Aparelhos | Arena Tech",
};

export default function DevicesPage() {
  return (
    <div>
      <PageHeader
        title="Aparelhos"
        subtitle="Cadastro de marcas e modelos de aparelhos"
        actions={
          <Button asChild>
            <Link href="/catalog/devices/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo Aparelho
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<LoadingState variant="table" />}>
        <DevicesTable />
      </Suspense>
    </div>
  );
}
