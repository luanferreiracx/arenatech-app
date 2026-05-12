import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomersTable } from "./_components/customers-table";

export const metadata = {
  title: "Clientes | Arena Tech",
};

function TableFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full max-w-sm" />
      <div className="rounded-md border border-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b border-border last:border-b-0">
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Gerencie todos os clientes cadastrados"
        actions={
          <Button asChild>
            <Link href="/customers/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo Cliente
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<TableFallback />}>
        <CustomersTable />
      </Suspense>
    </div>
  );
}
