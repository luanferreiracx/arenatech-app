import { ServiceOrderDetailClient } from "./_components/service-order-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ServiceOrderDetailPage({ params }: Props) {
  const { id } = await params;
  return <ServiceOrderDetailClient id={id} />;
}
