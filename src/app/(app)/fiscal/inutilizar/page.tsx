import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";

/**
 * Auditoria 2026-07-25 (decisao do dono 2026-07-27): esta tela tinha um
 * formulario completo cuja submissao chamava um MOCK — o backend validava a
 * faixa, escrevia um log e retornava `{ success: true }`. A SEFAZ nunca recebia
 * nada. O operador via "N numero(s) inutilizado(s) com sucesso", dava o assunto
 * por resolvido, e a lacuna de numeracao so aparecia na fiscalizacao.
 *
 * O formulario saiu (e o link tambem saiu do menu). A rota continua de pe para
 * quem tinha o link salvo, explicando o caminho que de fato funciona hoje.
 * Quando a integracao real existir, esta pagina volta a ser o formulario.
 */
export default function InutilizarPage() {
  return (
    <div>
      <PageHeader
        title="Inutilizar Numeracao"
        subtitle="Indisponivel no sistema — faca pelo portal da SEFAZ"
        actions={
          <Button variant="outline" asChild>
            <Link href="/fiscal">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inutilizacao ainda nao integrada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-yellow-400 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                <strong>Atencao!</strong> O envio da inutilizacao a SEFAZ ainda nao esta
                implementado neste sistema. Ate aqui, o formulario desta tela confirmava
                sucesso sem enviar nada.
              </span>
            </div>
            <p>
              Enquanto a integracao nao existe, faca a inutilizacao{" "}
              <strong className="text-foreground">pelo portal da SEFAZ do seu estado</strong> e
              guarde o protocolo com a contabilidade.
            </p>
            <p>
              O prazo continua valendo: ate o 10o dia do mes seguinte ao da numeracao que
              deveria ter sido usada.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quando inutilizar?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <ul className="list-disc list-inside space-y-1">
              <li>Quando houver quebra de sequencia na numeracao</li>
              <li>Notas que foram puladas por erro no sistema</li>
              <li>Numeracao reservada que nao sera mais utilizada</li>
            </ul>
            <p>
              A inutilizacao e irreversivel: os numeros informados ficam registrados na SEFAZ
              como inutilizados e nao podem mais ser emitidos.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
