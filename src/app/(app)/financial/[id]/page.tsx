import { TransactionDetailClient } from "./_components/transaction-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TransactionDetailPage({ params }: Props) {
  const { id } = await params;
  return <TransactionDetailClient id={id} />;
}
