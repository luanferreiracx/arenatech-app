import { CustomerDetailClient } from "./_components/customer-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;
  return <CustomerDetailClient id={id} />;
}
