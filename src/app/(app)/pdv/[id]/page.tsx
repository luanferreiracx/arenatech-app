import { SaleDetail } from "./_components/sale-detail";

export const metadata = {
  title: "Detalhe da Venda | Arena Tech",
};

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SaleDetail saleId={id} />;
}
