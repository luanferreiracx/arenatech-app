import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { VariationsManager } from "./_components/variations-manager";

export const metadata = {
  title: "Variacoes do Produto | Arena Tech",
};

export default function ProductVariationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div>
      <PageHeader
        title="Variacoes do Produto"
        subtitle="Edite preco, SKU e estoque minimo de cada variacao sem recriar as demais"
        actions={
          <Button variant="outline" asChild>
            <Link href={`/stock/${id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao produto
            </Link>
          </Button>
        }
      />
      <VariationsManager productId={id} />
    </div>
  );
}
