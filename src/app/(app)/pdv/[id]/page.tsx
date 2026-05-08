import { SaleDetailClient } from "../_components/sale-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SaleDetailPage({ params }: Props) {
  const { id } = await params;
  return <SaleDetailClient id={id} />;
}
