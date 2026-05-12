import { Suspense } from "react";
import { LoadingState } from "@/components/domain/loading-state";
import { ServiceOrderDetail } from "./_components/service-order-detail";

export const metadata = {
  title: "Detalhe da OS | Arena Tech",
};

export default async function ServiceOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<LoadingState />}>
      <ServiceOrderDetail id={id} />
    </Suspense>
  );
}
