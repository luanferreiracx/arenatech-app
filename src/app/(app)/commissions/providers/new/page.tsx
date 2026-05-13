import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";

export const metadata = {
  title: "Novo Prestador | Arena Tech",
};

export default function NewProviderPage() {
  return (
    <div>
      <PageHeader
        title="Novo Prestador"
        subtitle="Cadastrar novo prestador de servico"
        actions={
          <Button variant="outline" asChild>
            <Link href="/commissions/providers">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">
        Use a secao Operacao &gt; Prestadores para cadastrar prestadores.
        Esta pagina redireciona para o modulo de Operacao que ja possui o CRUD completo.
      </p>
      <div className="mt-4">
        <Button asChild>
          <Link href="/operation">Ir para Operacao</Link>
        </Button>
      </div>
    </div>
  );
}
