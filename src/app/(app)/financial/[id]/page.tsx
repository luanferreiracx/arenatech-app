import { TransactionDetail } from "../_components/transaction-detail";

export const metadata = {
  title: "Detalhe da Transacao | Arena Tech",
};

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <TransactionDetail transactionId={id} />
    </div>
  );
}
