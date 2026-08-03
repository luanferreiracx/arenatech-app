import { Metadata } from "next";
import Link from "next/link";
import { Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Aguardando aprovação | Arena Tech",
};

export default function RegisterPendingPage() {
  // AD-2: `<main>` em vez de `div`. Medido: as quatro telas de auto-cadastro não
  // tinham landmark nenhum (main 0, header 0) — mesma ausência do catálogo
  // público (CTU-2). São a porta de entrada de quem chega de fora e ainda não tem
  // conta; sem `main` não há como pular para o conteúdo (WCAG 1.3.1).
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-accent/20 p-4">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-border bg-card p-8 text-center sm:p-12">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock className="size-8" aria-hidden />
          </div>

          <h1 className="text-2xl font-bold">Aguardando aprovação</h1>

          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Recebemos seu cadastro e ele está em análise. Assim que for aprovado, você
            recebe uma mensagem no <strong className="text-foreground">WhatsApp</strong>{" "}
            informado e já entra com o e-mail e a senha que você acabou de cadastrar.
          </p>

          {/* O teste grátis começa na APROVAÇÃO, não aqui — dizer isso evita que a
              pessoa ache que está queimando dias de teste na fila. */}
          <p className="mt-4 text-sm text-muted-foreground">
            Seu período de teste só começa a contar depois da aprovação.
          </p>

          <p className="mt-8 text-sm text-muted-foreground">
            <Link href="/planos" className="underline hover:text-foreground">
              Ver os planos
            </Link>{" "}
            enquanto espera.
          </p>
        </div>
      </div>
    </main>
  );
}
