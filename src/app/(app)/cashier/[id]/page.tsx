import { CashDetailClient } from "./_components/cash-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CashDetailPage({ params }: Props) {
  const { id } = await params;
  return <CashDetailClient id={id} />;
}
