import Link from "next/link";
import { RegisterForm } from "./_components/register-form";
import { trpc } from "@/trpc/server";
import { formatCentsBRL } from "@/lib/format";

export const metadata = {
  title: "Cadastre sua Loja | Arena Tech",
};

/**
 * O plano escolhido chega em `?plano=<slug>` (link da página de preços). Quem
 * cai aqui direto, sem slug, se cadastra sem plano e escolhe depois — o funil
 * não pode ter porta única.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ plano?: string }>;
}) {
  const { plano } = await searchParams;
  // Resolvido no SERVIDOR: a tela só confirma um plano que o cadastro aceitaria
  // de fato. Slug torto vira `null` e a pessoa segue sem plano, sem erro na cara.
  const selectedPlan = plano ? await trpc.admin.publicPlanBySlug({ slug: plano }) : null;

  // AD-2: `<main>` em vez de `div`. Medido: as quatro telas de auto-cadastro não
  // tinham landmark nenhum (main 0, header 0) — mesma ausência do catálogo
  // público (CTU-2). São a porta de entrada de quem chega de fora e ainda não tem
  // conta; sem `main` não há como pular para o conteúdo (WCAG 1.3.1).
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-accent/20 p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">Arena Tech</h1>
          <p className="text-muted-foreground mt-2">Cadastre sua loja na plataforma</p>
        </div>

        {selectedPlan ? (
          <div className="mb-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
            <p className="text-sm text-muted-foreground">Plano escolhido</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="min-w-0 break-words text-base font-semibold">
                {selectedPlan.name}
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {formatCentsBRL(selectedPlan.monthlyPrice)}/mês após o teste
              </span>
            </p>
            <Link
              href="/planos"
              className="mt-2 inline-block text-xs text-muted-foreground underline hover:text-foreground"
            >
              Ver todos os planos
            </Link>
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            <p className="break-words">
              Você pode se cadastrar agora e escolher o plano depois, ou{" "}
              <Link href="/planos" className="underline hover:text-foreground">
                comparar os planos
              </Link>{" "}
              primeiro.
            </p>
          </div>
        )}

        <RegisterForm planSlug={selectedPlan?.slug ?? null} />
      </div>
    </main>
  );
}
