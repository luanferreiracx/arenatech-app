import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ServiceOrdersTable } from "./_components/service-orders-table";
import { ServiceOrderStats } from "./_components/service-order-stats";

export const metadata = {
  title: "Ordens de Servico | Arena Tech",
};

function TableFallback() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-sm" />
      <div className="rounded-md border border-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b border-border last:border-b-0">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ServiceOrdersPage() {
  return (
    <div>
      <PageHeader
        title="Ordens de Servico"
        subtitle="Gerencie todas as ordens de servico"
        actions={
          <Button asChild>
            <Link href="/service-orders/new">
              <Plus className="mr-2 h-4 w-4" />
              Nova OS
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<TableFallback />}>
        <ServiceOrderStats />
        <ServiceOrdersTable />
      </Suspense>
    </div>
  );
}
