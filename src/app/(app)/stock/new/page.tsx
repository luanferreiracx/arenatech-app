import { PageHeader } from "@/components/domain/page-header";
import { ProductForm } from "../_components/product-form";

export default function NewProductPage() {
  return (
    <div>
      <PageHeader title="Novo Produto" subtitle="Cadastre um novo produto no estoque" />
      <ProductForm mode="create" />
    </div>
  );
}
