import { PageHeader } from "@/components/domain/page-header";
import { ProductEditClient } from "./_components/product-edit-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title="Editar Produto" />
      <ProductEditClient id={id} />
    </div>
  );
}
