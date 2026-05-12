import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerDetail } from "./_components/customer-detail";

export const metadata = {
  title: "Detalhes do Cliente | Arena Tech",
};

function DetailFallback() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<DetailFallback />}>
      <CustomerDetail customerId={id} />
    </Suspense>
  );
}
